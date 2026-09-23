import { state } from '../state.js';

const EMOTION_EXPRESSIONS = [
  'happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral',
];

export function setFacialExpression(name) {
  if (!state.vrm?.expressionManager) return;
  if (state.currentExpression === name) return;

  state.vrm.expressionManager.setValue(state.currentExpression, 0);
  state.vrm.expressionManager.setValue(name, 1);
  state.currentExpression = name;
}