const { GESTURE_REGISTRY, EMOTION_TAG_MAP } = require('../avatar/gestures');

function parseOneTag(tag) {
  const raw = tag.trim();
  const t = raw.toLowerCase();

  if (EMOTION_TAG_MAP[t]) {
    return {
      name: 'set_expression',
      args: { emotion: EMOTION_TAG_MAP[t] },
    };
  }

  const g = t.match(/^gesture:(\w+)$/);
  if (g) {
    const semantic = g[1];
    const entry = GESTURE_REGISTRY[semantic];
    if (entry) {
      return {
        name: 'play_gesture',
        args: {
          number: entry.file,
          semantic,
          speakStartTime: entry.speakStartTime ?? 0,
        },
      };
    }
    console.warn('[WARNING] Gesture tidak dikenal:', semantic);
    return null;
  }

  const toolMatch = raw.match(/^tool:(\w+)\|?(.*)$/i);
  if (toolMatch) {
    return {
      name: 'execute_tool',
      args: { tool: toolMatch[1].toLowerCase(), rawArgs: toolMatch[2] ?? '' },
    };
  }

  console.warn('[WARNING] Tag tidak dikenal:', tag);
  return null;
}

function parseActions(text) {
  const actions = [];
  const tagRe = /^\s*\[([^\]]+)\]\s*/;
  let remaining = text;
  let m;

  while ((m = remaining.match(tagRe))) {
    const action = parseOneTag(m[1]);
    if (action) actions.push(action);
    remaining = remaining.slice(m[0].length);
  }

  if (actions.length === 0) {
    console.warn(
      '[WARNING] Tidak ada tag action di awal jawaban, fallback ke netral. Teks:',
      text.slice(0, 50)
    );
    actions.push({ name: 'set_expression', args: { emotion: 'neutral' } });
  }

  return { actions, cleanText: remaining };
}

module.exports = { parseOneTag, parseActions };