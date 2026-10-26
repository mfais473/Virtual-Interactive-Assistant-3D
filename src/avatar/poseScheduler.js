import { state } from '../state.js';
import { getPoseInfo, getLoadedPose, getFillerNames } from './poseLibrary.js';
import { playGesture } from './animationState.js';

const FADE = 0.3;          
const MIN_GAP = 1.0;       
const MIN_TAIL = 1.0;       
const DEFAULT_HOLD = 3.0;   
const FILLER_GAP = 1.8;     
const FILLER_LEAD = 1.4;    
const FILLER_HOLD_MAX = 1.5;
const IDLE_MIN = 30;                 
const IDLE_MAX = 60;
const IDLE_GESTURES = [1, 2, 3, 4]; 
let session = null;
let nextIdleAt = performance.now() / 1000 + 5;
let lastIdleGesture = null;
let idleGesture = null;           
let idleGestureTimer = null;
const rand = (a, b) => a + Math.random() * (b - a);
const nowSec = () => performance.now() / 1000;

function scheduleNextIdle() {
  nextIdleAt = nowSec() + rand(IDLE_MIN, IDLE_MAX);
}

function currentIdle() {
  return state.animations[state.currentMode]?.idle ?? null;
}

export function startPoseSession(audio, actions) {
  const cues = (actions ?? [])
    .filter((a) => a.name === 'play_pose' && a.args?.pose)
    .map((a) => ({ pose: a.args.pose, at: Number(a.args.at) || 0 }))
    .sort((a, b) => a.at - b.at);
  interruptIdleGesture();
  const carried = session?.current ?? null;
  session = {
    audio,
    cues,
    resolved: false,
    next: 0,
    current: carried ? { ...carried, startedAt: 0 } : null,
    lastEnd: 0,
    lastFiller: null,
  };
}

export function endPoseSession(audio) {
  if (!session) return;
  if (audio && session.audio !== audio) return;
  releaseCurrent(session);
  session = null;
  scheduleNextIdle(); 
}

export function detachActivePose() {
  if (!session?.current) return null;
  const action = session.current.action;
  session.current = null;
  return action;
}

function resolveCues(s, duration) {
  const kept = [];
  let lastTime = -Infinity;
  const dropped = [];
  for (const cue of s.cues) {
    const time = Math.min(Math.max(cue.at, 0), 1) * duration;
    if (time > duration - MIN_TAIL || time - lastTime < MIN_GAP) {
      dropped.push(cue.pose);
      continue;
    }
    kept.push({ pose: cue.pose, time });
    lastTime = time;
  }
  s.cues = kept;
  s.resolved = true;
  console.log(
    `[pose] audio ${duration.toFixed(1)}s ->`,
    kept.map((c) => `${c.pose}@${c.time.toFixed(1)}s`).join(', ') || '(tidak ada)',
    dropped.length ? `| dibuang (terlalu rapat/mepet): ${dropped.join(', ')}` : ''
  );
}

export function updatePoseCues() {
  const s = session;
  if (!s) {
    updateIdleGesture();
    return;
  }
  const { audio } = s;
  if (audio.paused || audio.ended) return;
  const duration = audio.duration;
  if (!Number.isFinite(duration) || duration <= 0) return; // metadata belum siap
  if (!s.resolved) resolveCues(s, duration);
  const t = audio.currentTime;
  let due = null;
  while (s.next < s.cues.length && s.cues[s.next].time <= t) {
    due = s.cues[s.next++];
  }
  if (due) {
    const hold = Number(getPoseInfo(due.pose)?.hold) || DEFAULT_HOLD;
    if (!activate(s, due.pose, t, hold)) {
      console.warn('[pose] Pose belum siap / gagal dimuat, dilewati:', due.pose);
    }
  } else if (s.current) {
    if (t - s.current.startedAt >= s.current.hold) {
      releaseCurrent(s);
      s.lastEnd = t;
    }
  } else {
    maybeFiller(s, t, duration);
  }
}

function maybeFiller(s, t, duration) {
  if (t - s.lastEnd < FILLER_GAP) return;
  if (state.activeGesture?.isRunning()) return;
  const nextCue = s.cues[s.next];
  const untilNext = nextCue ? nextCue.time - t : Infinity;
  if (untilNext < FILLER_LEAD) return;
  if (duration - t < FILLER_LEAD) return; 
  const name = pickFiller(s.lastFiller, nextCue?.pose);
  if (!name) return;
  const hold = Math.min(Number(getPoseInfo(name)?.hold) || DEFAULT_HOLD, FILLER_HOLD_MAX);
  if (activate(s, name, t, hold)) s.lastFiller = name;
  else s.lastEnd = t;
}

function updateIdleGesture() {
  const now = nowSec();
  if (state.activeGesture?.isRunning()) {
    nextIdleAt = now + rand(IDLE_MIN, IDLE_MAX);
    return;
  }
  idleGesture = null;
  if (now < nextIdleAt) return;
  if (state.isRecording || state.awaitingConfirmation) {
    nextIdleAt = now + 3;
    return;
  }
  const ready = IDLE_GESTURES.filter((n) => state.gestureActions[n] && n !== lastIdleGesture);
  const pool = ready.length > 0 ? ready : IDLE_GESTURES.filter((n) => state.gestureActions[n]);
  if (pool.length === 0) {
    nextIdleAt = now + 3; 
    return;
  }
  const n = pool[Math.floor(Math.random() * pool.length)];
  lastIdleGesture = n;
  playGesture(n);
  idleGesture = state.activeGesture;
}

function interruptIdleGesture() {
  const g = idleGesture;
  idleGesture = null;
  if (!g || state.activeGesture !== g || !g.isRunning()) return;
  const idle = currentIdle();
  state.activeGesture = null;
  if (idle) {
    idle.reset();
    idle.play();
    idle.crossFadeFrom(g, 0.3, false);
  }
  clearTimeout(idleGestureTimer);
  idleGestureTimer = setTimeout(() => g.stop(), 350);
}

function pickFiller(last, avoid) {
  const pool = getFillerNames().filter(
    (n) => n !== last && n !== avoid && getLoadedPose(n)
  );
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function activate(box, name, t, hold) {
  const action = getLoadedPose(name);
  if (!action) return false;
  if (state.activeGesture?.isRunning()) return false;
  // Pose yang sama sedang aktif: cukup perpanjang masa tahannya.
  if (box.current?.action === action) {
    box.current.startedAt = t;
    box.current.hold = hold;
    return true;
  }
  let from = box.current?.action ?? null;
  if (!from) {
    const idle = currentIdle();
    if (idle && !idle.isRunning()) idle.reset().play();
    from = idle;
  }
  action.reset();
  action.play();
  if (from) action.crossFadeFrom(from, FADE, false);
  else action.fadeIn(FADE);
  box.current = { name, action, startedAt: t, hold };
  return true;
}

function releaseCurrent(box) {
  const cur = box.current;
  if (!cur) return;
  box.current = null;
  const idle = currentIdle();
  if (idle) {
    idle.reset();
    idle.play();
    idle.crossFadeFrom(cur.action, FADE, false);
  } else {
    cur.action.fadeOut(FADE);
  }
}