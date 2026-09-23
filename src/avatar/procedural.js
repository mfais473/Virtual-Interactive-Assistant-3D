import { state } from '../state.js';

let nextBlinkAt = 2;
let blinkStartTime = null;
const BLINK_DURATION = 0.15;

export function updateProceduralMotion(elapsedTime) {
  if (!state.vrm) return;

  const chest =
    state.vrm.humanoid?.getNormalizedBoneNode('chest') ||
    state.vrm.humanoid?.getNormalizedBoneNode('spine');
  if (chest) {
    chest.rotation.x = Math.sin(elapsedTime * 1.2) * 0.02;
  }

  const head = state.vrm.humanoid?.getNormalizedBoneNode('head');
  if (head) {
    head.rotation.y = Math.sin(elapsedTime * 0.5) * 0.03;
  }

  if (elapsedTime > nextBlinkAt && blinkStartTime === null) {
    blinkStartTime = elapsedTime;
    nextBlinkAt = elapsedTime + 2 + Math.random() * 3;
  }
  if (blinkStartTime !== null) {
    const t = (elapsedTime - blinkStartTime) / BLINK_DURATION;
    if (t < 1) {
      const blinkValue = t < 0.5 ? t * 2 : (1 - t) * 2;
      state.vrm.expressionManager?.setValue('blink', blinkValue);
    } else {
      state.vrm.expressionManager?.setValue('blink', 0);
      blinkStartTime = null;
    }
  }
}