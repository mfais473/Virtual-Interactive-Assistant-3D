import * as THREE from 'three';
import { state } from '../state.js';
import { getMouthLevel } from '../avatar/lipsync.js';

const CFG = {
  MAX_WIDTH: 330,        
  MIN_SIDE_SPACE: 190,   
  GAP: 12,               
  MARGIN: 10,            
  TAIL_PAD: 24,         
  HEAD_CENTER_Y: 0.09,   
  HEAD_RADIUS: 0.11,     
  FOLLOW_SPEED: 6,      

  PAGE_CHARS: 140,       
  PAGE_HARD_FACTOR: 1.35,
  MIN_LAST_PAGE: 28,     
  REVEAL_LEAD: 0.012,    
  FALLBACK_CPS: 15,      

  LINGER_BASE: 1800,     
  LINGER_PER_CHAR: 18,
  LINGER_MAX: 5500,
};

let layer = null;
let el = null;          
let textEl = null;
let dotsEl = null;
let eqBars = [];
let ro = null;
let ui = 1;            
let bw = 0;             
let bh = 0;
let session = null;     
let mode = 'idle';      
let fadeTimer = null;
let asking = false;
let anchorInit = false;
let ax = 0;
let ay = 0;
let lastSide = null;
let lastMood = null;
let lastWidth = 0;
let lastPage = -1;

const _v = new THREE.Vector3();

const STAR_PATH = 'M12 0 C12.9 7.2 16.8 11.1 24 12 C16.8 12.9 12.9 16.8 12 24 C11.1 16.8 7.2 12.9 0 12 C7.2 11.1 11.1 7.2 12 0Z';

export function initSpeechBubble() {
  if (layer) return;

  layer = document.createElement('div');
  layer.id = 'via-bubble-layer';
  layer.dataset.mood = 'neutral';
  layer.innerHTML = `
    <div class="via-bubble" data-side="right">
      <span class="via-tail"></span>
      <div class="via-name">
        <svg class="via-star" viewBox="0 0 24 24"><path d="${STAR_PATH}"/></svg>
        <span>Via</span>
        <span class="via-eq"><i></i><i></i><i></i></span>
      </div>
      <svg class="via-spark" viewBox="0 0 24 24"><path d="${STAR_PATH}"/></svg>
      <div class="via-thinking"><i></i><i></i><i></i></div>
      <div class="via-text"></div>
      <div class="via-footer">
        <div class="via-dots"></div>
        <div class="via-keys">
          <span class="via-key"><b>Y</b>ya</span>
          <span class="via-key"><b>N</b>tidak</span>
          <span class="via-key"><b>T</b>tanya</span>
        </div>
      </div>
    </div>`;
  document.body.appendChild(layer);

  el = layer.querySelector('.via-bubble');
  textEl = layer.querySelector('.via-text');
  dotsEl = layer.querySelector('.via-dots');
  eqBars = [...layer.querySelectorAll('.via-eq i')];

  ro = new ResizeObserver(() => {
    bw = el.offsetWidth;
    bh = el.offsetHeight;
  });
  ro.observe(el);

  applyUiScale();
  window.addEventListener('resize', applyUiScale);
}

function applyUiScale() {
  if (!layer) return;
  ui = Math.min(1.2, Math.max(0.62, Math.min(window.innerWidth, window.innerHeight) / 900));
  layer.style.setProperty('--ui', ui.toFixed(3));
  lastWidth = 0; // paksa hitung ulang lebar
}

function cleanForDisplay(raw) {
  return String(raw ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\*+|`+/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPages(text) {
  const words = [];
  const re = /\S+\s*/g;
  let m;
  while ((m = re.exec(text))) words.push({ text: m[0], start: m.index });

  const pages = [];
  let cur = [];
  let chars = 0;
  for (const w of words) {
    cur.push(w);
    chars += w.text.length;
    const endsSentence = /[.!?…]["')\]]?\s*$/.test(w.text);
    if (
      (chars >= CFG.PAGE_CHARS && endsSentence) ||
      chars >= CFG.PAGE_CHARS * CFG.PAGE_HARD_FACTOR
    ) {
      pages.push(cur);
      cur = [];
      chars = 0;
    }
  }
  if (cur.length) {
    if (pages.length && chars < CFG.MIN_LAST_PAGE) pages[pages.length - 1].push(...cur);
    else pages.push(cur);
  }
  return pages;
}

function renderPage(pageIdx) {
  const page = session.pages[pageIdx];
  const frag = document.createDocumentFragment();
  session.spans = page.map((w) => {
    const s = document.createElement('span');
    s.className = 'via-w';
    s.textContent = w.text;
    frag.appendChild(s);
    return s;
  });
  textEl.replaceChildren(frag);
  session.shown = 0;
  session.curSpan = null;

  if (pageIdx > 0) {
    textEl.classList.remove('is-swap');
    void textEl.offsetWidth;
    textEl.classList.add('is-swap');
  }

  const n = session.pages.length;
  dotsEl.style.display = n > 1 ? 'flex' : 'none';
  if (dotsEl.childElementCount !== n) {
    dotsEl.replaceChildren(...Array.from({ length: n }, () => document.createElement('i')));
  }
  [...dotsEl.children].forEach((d, i) => d.classList.toggle('act', i === pageIdx));
  lastPage = pageIdx;
}

function cancelFade() {
  if (fadeTimer) {
    clearTimeout(fadeTimer);
    fadeTimer = null;
  }
}

function popIn() {
  cancelFade();
  el.classList.remove('is-out', 'is-in');
  void el.offsetWidth;
  el.classList.add('is-visible', 'is-in');
}

/** Tampilkan titik "sedang berpikir" selama menunggu balasan (STT -> LLM -> TTS). */
export function showThinking() {
  if (!el) return;
  session = null;
  asking = false;
  el.classList.remove('is-asking');
  if (mode !== 'thinking') {
    el.classList.add('is-thinking');
    lastWidth = 0;
    el.style.width = '';
    popIn();
  }
  mode = 'thinking';
}

/**
 * Mulai menampilkan teks balasan, disinkronkan ke `audio`.
 * result: { text, awaitingConfirmation }
 */
export function startSpeechBubble(audio, result) {
  if (!el) return;
  const text = cleanForDisplay(result?.text);
  if (!text) {
    hideBubble();
    return;
  }

  const wasThinking = mode === 'thinking';
  session = {
    audio,
    text,
    len: text.length,
    pages: buildPages(text),
    spans: [],
    shown: 0,
    curSpan: null,
    ended: false,
    endedAt: 0,
  };
  asking = Boolean(result?.awaitingConfirmation);
  mode = 'speaking';

  el.classList.remove('is-thinking');
  el.classList.toggle('is-asking', asking);
  lastWidth = 0;
  lastPage = -1;
  renderPage(0);
  popIn();
  if (!wasThinking) anchorInit = false; 
}

/** Dipanggil saat audio selesai / error. Bubble bertahan sebentar lalu memudar. */
export function endSpeechBubble(audio) {
  if (!session) return;
  if (audio && session.audio !== audio) return;
  session.ended = true;
  session.endedAt = performance.now();
}

/** Sembunyikan bubble (mis. izin sudah kedaluwarsa, atau tidak ada balasan). */
export function hideBubble() {
  if (!el) return;
  session = null;
  asking = false;
  mode = 'idle';
  el.classList.remove('is-asking');
  el.classList.add('is-out');
  el.classList.remove('is-visible');
  cancelFade();
  fadeTimer = setTimeout(() => {
    el.classList.remove('is-in', 'is-out', 'is-thinking');
    fadeTimer = null;
  }, 500);
}

export function updateSpeechBubble(dt) {
  if (!el || mode === 'idle') return;

  if (mode === 'speaking' && session) updateReveal();
  updateEqualizer();
  updateLayout(dt);
}

function currentProgressChars() {
  const s = session;
  if (s.ended) return s.len + 1;
  const a = s.audio;
  const dur = a.duration;
  let f;
  if (Number.isFinite(dur) && dur > 0) f = a.currentTime / dur;
  else f = a.currentTime / Math.max(1, s.len / CFG.FALLBACK_CPS);
  f = Math.min(1, Math.max(0, f)) + CFG.REVEAL_LEAD;
  return f * s.len;
}

function updateReveal() {
  const s = session;
  const progress = currentProgressChars();

  if (!s.ended) {
    const mood = state.currentExpression || 'neutral';
    if (mood !== lastMood) {
      layer.dataset.mood = mood;
      lastMood = mood;
    }
  }

  let pageIdx = 0;
  for (let i = 0; i < s.pages.length; i++) {
    if (s.pages[i][0].start <= progress) pageIdx = i;
    else break;
  }
  if (pageIdx !== lastPage) renderPage(pageIdx);

  const page = s.pages[pageIdx];
  while (s.shown < page.length && page[s.shown].start <= progress) {
    const span = s.spans[s.shown];
    span.classList.add('on');
    s.shown++;
  }

  const last = s.shown > 0 ? s.spans[s.shown - 1] : null;
  if (last !== s.curSpan) {
    s.curSpan?.classList.remove('cur');
    if (last && !s.ended) last.classList.add('cur');
    s.curSpan = last;
  }
  if (s.ended && s.curSpan) {
    s.curSpan.classList.remove('cur');
    s.curSpan = null;
  }
  if (s.ended && !asking) {
    const linger = Math.min(CFG.LINGER_MAX, CFG.LINGER_BASE + s.len * CFG.LINGER_PER_CHAR);
    if (performance.now() - s.endedAt > linger) hideBubble();
  }
}

function updateEqualizer() {
  const speaking = mode === 'speaking' && session && !session.ended;
  const lvl = speaking ? Math.min(1, getMouthLevel() * 1.4) : 0;
  const t = performance.now() / 1000;
  for (let i = 0; i < eqBars.length; i++) {
    const wobble = 0.65 + 0.35 * Math.sin(t * 11 + i * 2.1);
    const v = speaking ? 0.22 + lvl * wobble * 0.95 : 0.22;
    eqBars[i].style.transform = `scaleY(${Math.min(1, v).toFixed(3)})`;
  }
}

function updateLayout(dt) {
  const cam = state.camera;
  if (!cam) return;
  const W = window.innerWidth;
  const H = window.innerHeight;

  let tx = W / 2;
  let ty = H * 0.25;
  let tr = 50 * ui;
  const head = state.vrm?.humanoid?.getRawBoneNode?.('head');
  if (head) {
    head.getWorldPosition(_v);
    _v.y += CFG.HEAD_CENTER_Y;
    cam.updateMatrixWorld();
    const dist = Math.max(0.1, cam.position.distanceTo(_v));
    const pxPerM = (H / 2) / (Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist);
    _v.project(cam);
    tx = (_v.x * 0.5 + 0.5) * W;
    ty = (-_v.y * 0.5 + 0.5) * H;
    tr = CFG.HEAD_RADIUS * pxPerM;
  }

  if (!anchorInit) {
    ax = tx;
    ay = ty;
    anchorInit = true;
  } else {
    const k = 1 - Math.exp(-CFG.FOLLOW_SPEED * Math.min(dt, 0.05));
    ax += (tx - ax) * k;
    ay += (ty - ay) * k;
  }

  const gap = CFG.GAP * ui;
  const margin = CFG.MARGIN * ui;
  const minSide = CFG.MIN_SIDE_SPACE * ui;
  const availR = W - margin - (ax + tr + gap);
  const availL = ax - tr - gap - margin;

  let side = lastSide;
  if (Math.max(availR, availL) < minSide) {
    side = 'top';
  } else if (!side || side === 'top') {
    side = availR >= availL ? 'right' : 'left';
  } else if (side === 'right' && (availR < minSide || availL > availR + 60 * ui)) {
    side = 'left';
  } else if (side === 'left' && (availL < minSide || availR > availL + 60 * ui)) {
    side = 'right';
  }
  if (side !== lastSide) {
    el.dataset.side = side;
    lastSide = side;
  }

  if (mode === 'speaking') {
    const avail = side === 'top' ? W - 2 * margin : side === 'right' ? availR : availL;
    const w = Math.round(Math.min(avail, CFG.MAX_WIDTH * ui));
    if (Math.abs(w - lastWidth) > 2) {
      el.style.width = `${w}px`;
      lastWidth = w;
    }
  }

  const w = bw || 200 * ui;
  const h = bh || 80 * ui;
  const padTail = CFG.TAIL_PAD * ui;
  let x;
  let y;
  let tail;

  if (side === 'top') {
    x = Math.min(Math.max(ax - w / 2, margin), W - w - margin);
    y = Math.min(Math.max(ay - tr - gap - h, margin), H - h - margin);
    tail = Math.min(Math.max(ax - x, padTail), w - padTail);
    el.style.setProperty('--tail-x', `${tail}px`);
    el.style.setProperty('--tail-y', '100%');
  } else {
    x = side === 'right' ? ax + tr + gap : ax - tr - gap - w;
    y = Math.min(Math.max(ay - h * 0.55, margin), H - h - margin);
    tail = Math.min(Math.max(ay - y, padTail), h - padTail);
    el.style.setProperty('--tail-x', side === 'right' ? '0%' : '100%');
    el.style.setProperty('--tail-y', `${tail}px`);
  }
  el.style.setProperty('--tail-pos', `${tail.toFixed(1)}px`);
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
}