import { state } from '../state.js';
const NEUTRAL = 'neutral';
const EXPRESSION_WEIGHT = 0.6;
const BLEND_SPEED = 8;
let targetName = NEUTRAL;
const weights = {}; 

export function setFacialExpression(name) {
  const em = state.vrm?.expressionManager;
  if (!em) return;
  const target = name || NEUTRAL;
  if (!em.getExpression(target)) {
    console.warn('[expression] Model tidak punya ekspresi:', target);
    return;
  }
  if (state.currentExpression === target) return;
  targetName = target;
  state.currentExpression = target;
}

export function updateExpressionBlend(dt) {
  const em = state.vrm?.expressionManager;
  if (!em) return;
  const k = 1 - Math.exp(-BLEND_SPEED * dt);
  const names = new Set([...Object.keys(weights), targetName]);
  for (const name of names) {
    if (!em.getExpression(name)) continue;
    const goal = name === targetName ? EXPRESSION_WEIGHT : 0;
    const cur = weights[name] ?? 0;
    let next = cur + (goal - cur) * k;
    if (Math.abs(next - goal) < 0.002) next = goal;
    em.setValue(name, next);
    if (next === 0 && name !== targetName) delete weights[name];
    else weights[name] = next;
  }
}

export function resetFacialExpression() {
  setFacialExpression(NEUTRAL);
}