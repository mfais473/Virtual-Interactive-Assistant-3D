import { state } from '../state.js';
const CONFIG = {
  FFT_SIZE: 1024,            
  NOISE_GATE: 0.02,          
  GAIN: 6,                    
  MAX_OPEN: 0.8,              
  ATTACK: 0.6,                
  RELEASE: 0.35,              
  OU_WEIGHT: 0.3,             
  IH_WEIGHT: 0.5,             
  SPLIT_HZ: 2500,             
  HIGH_HZ: 8000,              
};
let audioCtx = null;
let analyser = null;
let timeData = null;            
let freqData = null;            
let sourceNode = null;          
let isSetup = false;           
let smoothed = { aa: 0, ou: 0, ih: 0 };  
let peak = 0;                           

function ensureAudioContext() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    console.warn('[lipSync] Web Audio API tidak didukung browser ini.');
    return;
  }
  audioCtx = new Ctx();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = CONFIG.FFT_SIZE;
  analyser.smoothingTimeConstant = 0.3;  // hanya mempengaruhi data frekuensi
  timeData = new Uint8Array(analyser.fftSize);
  freqData = new Uint8Array(analyser.frequencyBinCount);
}

/**
 * Resume AudioContext. Panggil dari event handler user (klik/tap)
 * karena autoplay policy browser.
 */
export async function resumeAudioContext() {
  ensureAudioContext();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume();
    } catch (err) {
      console.warn('[lipSync] Gagal resume AudioContext:', err);
    }
  }
}

/**
 * Sambungkan audio element ke analyser.
 * IDEMPOTEN: aman dipanggil berkali-kali dengan element yang sama.
 */
export function setupLipSync(audioElement) {
  if (!audioElement) {
    console.warn('[lipSync] audioElement tidak valid.');
    return;
  }
  ensureAudioContext();
  if (!audioCtx) return;
  if (isSetup && sourceNode) {
    console.debug('[lipSync] setup sudah dilakukan, skip.');
    return;
  }
  try {
    sourceNode = audioCtx.createMediaElementSource(audioElement);
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
    isSetup = true;
  } catch (err) {
    console.error('[lipSync] Gagal setup:', err);
  }
}

/**
 * Bersihkan resource. Panggil saat audio element dibuang / komponen unmount.
 */
export function teardownLipSync() {
  try {
    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }
    if (analyser) {
      analyser.disconnect();
    }
    isSetup = false;
    smoothed = { aa: 0, ou: 0, ih: 0 };
    peak = 0;
    // Reset mulut
    if (state.vrm?.expressionManager) {
      state.vrm.expressionManager.setValue('aa', 0);
      state.vrm.expressionManager.setValue('ou', 0);
      state.vrm.expressionManager.setValue('ih', 0);
    }
  } catch (err) {
    console.warn('[lipSync] Error saat teardown:', err);
  }
}

/** Level bukaan mulut terhaluskan (0..~0.8), dipakai gerak kepala saat bicara. */
export function getMouthLevel() {
  return state.lipSyncActive ? smoothed.aa : 0;
}

function avgRange(arr, start, end) {
  const e = Math.min(end, arr.length);
  if (e <= start) return 0;
  let sum = 0;
  for (let i = start; i < e; i++) sum += arr[i];
  return sum / (e - start);
}

/** Volume (RMS 0-1) dari data gelombang 8-bit (nilai tengah = 128). */
function computeRms() {
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / timeData.length);
}

/** Maju menuju target: cepat saat membuka, lebih lambat saat menutup. */
function approach(current, target) {
  const k = target > current ? CONFIG.ATTACK : CONFIG.RELEASE;
  return current + (target - current) * k;
}

export function updateLipSync() {
  // Guard: VRM belum siap
  if (!state.vrm?.expressionManager) return;
  const em = state.vrm.expressionManager;
  if (!state.lipSyncActive) {
    smoothed.aa *= 0.7;
    smoothed.ou *= 0.7;
    smoothed.ih *= 0.7;
    em.setValue('aa', smoothed.aa);
    em.setValue('ou', smoothed.ou);
    em.setValue('ih', smoothed.ih);
    return;
  }
  if (!analyser || !timeData || !freqData) return;
  analyser.getByteTimeDomainData(timeData);
  const rms = computeRms();
  peak = Math.max(peak * 0.999, rms);
  const level = Math.max(0, rms - CONFIG.NOISE_GATE);
  const open = Math.min(1, level * CONFIG.GAIN);
  let bright = 0;
  if (open > 0.02) {
    analyser.getByteFrequencyData(freqData);
    const binHz = audioCtx.sampleRate / analyser.fftSize;
    const split = Math.round(CONFIG.SPLIT_HZ / binHz);
    const top = Math.round(CONFIG.HIGH_HZ / binHz);
    const low = avgRange(freqData, 2, split);
    const high = avgRange(freqData, split, top);
    bright = high / (low + high + 1e-6);
  }
  const targets = {
    aa: open * CONFIG.MAX_OPEN,
    ou: open * (1 - bright) * CONFIG.OU_WEIGHT,
    ih: open * bright * CONFIG.IH_WEIGHT,
  };
  smoothed.aa = approach(smoothed.aa, targets.aa);
  smoothed.ou = approach(smoothed.ou, targets.ou);
  smoothed.ih = approach(smoothed.ih, targets.ih);
  em.setValue('aa', smoothed.aa);
  em.setValue('ou', smoothed.ou);
  em.setValue('ih', smoothed.ih);
}

let _perfSamples = [];
export function getLipSyncStats() {
  if (_perfSamples.length === 0) return null;
  const avg = _perfSamples.reduce((a, b) => a + b, 0) / _perfSamples.length;
  const max = Math.max(..._perfSamples);
  return {
    avgUs: (avg * 1000).toFixed(2),
    maxUs: (max * 1000).toFixed(2),
    samples: _perfSamples.length,
    peak: peak.toFixed(3),
  };
}

export function resetLipSyncStats() {
  _perfSamples = [];
}