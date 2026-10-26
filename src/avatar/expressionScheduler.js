import { setFacialExpression } from './expressions.js';
const LEAD = 0.15;      
const MIN_TAIL = 0.5;   
let session = null;

export function startExpressionSession(audio, actions) {
  const cues = (actions ?? [])
    .filter((a) => a.name === 'set_expression' && a.args?.emotion && Number(a.args.at) > 0)
    .map((a) => ({ emotion: a.args.emotion, at: Number(a.args.at) }))
    .sort((a, b) => a.at - b.at);
  session = cues.length > 0 ? { audio, cues, resolved: false, next: 0 } : null;
}

export function endExpressionSession(audio) {
  if (!session) return;
  if (audio && session.audio !== audio) return;
  session = null;
}

function resolveCues(s, duration) {
  const resolved = [];
  const dropped = [];
  for (const cue of s.cues) {
    const time = Math.max(0, Math.min(cue.at, 1) * duration - LEAD);
    if (time > duration - MIN_TAIL) {
      dropped.push(cue.emotion);
      continue;
    }
    resolved.push({ emotion: cue.emotion, time });
  }
  s.cues = resolved;
  s.resolved = true;
  console.log(
    `[expression] audio ${duration.toFixed(1)}s ->`,
    resolved.map((c) => `${c.emotion}@${c.time.toFixed(1)}s`).join(', ') || '(tidak ada)',
    dropped.length ? `| dibuang (mepet akhir audio): ${dropped.join(', ')}` : ''
  );
}

export function updateExpressionCues() {
  const s = session;
  if (!s) return;
  const { audio } = s;
  if (audio.paused || audio.ended) return;
  const duration = audio.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  if (!s.resolved) resolveCues(s, duration);
  const t = audio.currentTime;
  let due = null;
  while (s.next < s.cues.length && s.cues[s.next].time <= t) {
    due = s.cues[s.next++];
  }
  if (due) setFacialExpression(due.emotion);
}
