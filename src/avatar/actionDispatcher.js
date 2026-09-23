import { setFacialExpression } from './expressions.js';
import { playGesture } from './animationState.js';

export function dispatchActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return;

  let expressionDone = false;
  let gestureDone = false;

  for (const action of actions) {
    switch (action.name) {
      case 'set_expression':
        if (!expressionDone) {
          setFacialExpression(action.args.emotion);
          expressionDone = true;
        }
        break;

      case 'play_gesture':
        if (!gestureDone) {
          playGesture(action.args.number);
          gestureDone = true;
          console.log(
            `Gesture dipicu: #${action.args.number}` +
            (action.args.semantic ? ` (${action.args.semantic})` : '')
          );
        }
        break;

      default:
        console.warn('Action tidak dikenal dari LLM:', action);
    }
  }
}