import { state } from '../state.js';

// Singleton AudioContext + analyser
let audioCtx = null;
let analyser = null;
let audioDataArray = null;

function ensureAudioContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  audioDataArray = new Uint8Array(analyser.frequencyBinCount);
}

export async function resumeAudioContext() {
  ensureAudioContext();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
}

export function setupLipSync(audioElement) {
  ensureAudioContext();
  const source = audioCtx.createMediaElementSource(audioElement);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
}

export function updateLipSync() {
  if (!state.vrm?.expressionManager) return;

  if (!state.lipSyncActive) {
    state.vrm.expressionManager.setValue('aa', 0);
    return;
  }

  analyser.getByteFrequencyData(audioDataArray);
  const avg = audioDataArray.reduce((sum, v) => sum + v, 0) / audioDataArray.length;
  const mouthOpen = Math.min(1, (avg / 255) * 2.5);

  state.vrm.expressionManager.setValue('aa', mouthOpen);
}