import { setFacialExpression } from './expressions.js';

export function dispatchActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return;

  let expressionDone = false;

  for (const action of actions) {
    switch (action.name) {
      case 'set_expression':
        if (!expressionDone && !(Number(action.args?.at) > 0)) {
          setFacialExpression(action.args?.emotion);
          expressionDone = true;
        }
        break;

      case 'play_pose':
        break;

      default:
        console.warn('[action] Tidak dikenal dari LLM:', action);
    }
  }

  if (!expressionDone) setFacialExpression('neutral');
}
