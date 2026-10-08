const { GESTURE_REGISTRY } = require('../avatar/gestures');

function checkGestureEmotionConsistency(actions) {
  const expr = actions.find((a) => a.name === 'set_expression');
  const gest = actions.find((a) => a.name === 'play_gesture');
  if (!expr || !gest) return;

  const semantic = gest.args.semantic;
  const entry = GESTURE_REGISTRY[semantic];
  if (!entry) return;

  const emotion = expr.args.emotion;
  if (!entry.pairsWith.includes(emotion)) {
    console.warn(
      `[KONSISTENSI] Emosi "${emotion}" dipasangkan dengan gesture "${semantic}" ` +
      `(biasanya cocok dengan: ${entry.pairsWith.join(', ')})`
    );
  }
}

module.exports = { checkGestureEmotionConsistency };