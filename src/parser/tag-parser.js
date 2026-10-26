const { EMOTION_TAG_MAP, maxExpressionsForWords } = require('./emotion-registry');
const { isValidPose, maxPosesForWords } = require('./pose-registry');
const POSE_TAG = /^gerak\s*:\s*(.*)$/i;
const EMOTION_WORDS = new Set(Object.keys(EMOTION_TAG_MAP));

function parseOneTag(tag) {
  const raw = tag.trim();
  const t = raw.toLowerCase();
  const poseMatch = raw.match(POSE_TAG);
  if (poseMatch) {
    const pose = poseMatch[1].trim().toLowerCase();
    if (!isValidPose(pose)) {
      console.warn('[WARNING] Gerak tidak dikenal:', pose);
      return null;
    }
    return { name: 'play_pose', args: { pose, at: 0 } };
  }
  if (EMOTION_TAG_MAP[t]) {
    return {
      name: 'set_expression',
      args: { emotion: EMOTION_TAG_MAP[t], at: 0 },
    };
  }
  if (/^tool:/i.test(raw)) {
    console.warn('[WARNING] Tag tool teks diabaikan:', tag);
    return null;
  }
  console.warn('[WARNING] Tag tidak dikenal:', tag);
  return null;
}

function extractInlineTags(text) {
  const re = /\[\s*([^\]]+?)\s*\]/g;
  let out = '';
  let last = 0;
  const found = [];
  let m;
  while ((m = re.exec(text))) {
    const inner = m[1];
    const poseMatch = inner.match(POSE_TAG);
    const emotionKey = inner.toLowerCase();
    const isEmotion = !poseMatch && EMOTION_WORDS.has(emotionKey);
    if (!poseMatch && !isEmotion) continue;
    out += text.slice(last, m.index);
    last = m.index + m[0].length;
    if (out === '' || /\s$/.test(out)) {
      while (last < text.length && /\s/.test(text[last])) last++;
    } else if (last < text.length && !/\s/.test(text[last])) {
      out += ' ';
    }
    if (isEmotion) {
      found.push({
        type: 'emotion',
        emotion: EMOTION_TAG_MAP[emotionKey],
        index: out.length,
      });
      continue;
    }
    found.push({
      type: 'pose',
      pose: poseMatch[1].trim().toLowerCase(),
      index: out.length,
    });
  }
  out += text.slice(last);
  const trimmed = out.trimStart();
  const shift = out.length - trimmed.length;
  const cleanText = trimmed.trimEnd();
  const cues = [];
  for (const f of found) {
    const at = cleanText.length > 0 ? (f.index - shift) / cleanText.length : 0;
    const atRounded = Math.round(Math.min(Math.max(at, 0), 1) * 1000) / 1000;
    if (f.type === 'emotion') {
      cues.push({
        name: 'set_expression',
        args: { emotion: f.emotion, at: atRounded },
      });
      continue;
    }
    if (!isValidPose(f.pose)) {
      console.warn('[WARNING] Gerak tidak dikenal:', f.pose);
      continue;
    }
    cues.push({
      name: 'play_pose',
      args: { pose: f.pose, at: atRounded },
    });
  }
  return { cleanText, cues };
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeActions(actions, wordCount) {
  const maxPoses = maxPosesForWords(wordCount);
  const maxExprs = maxExpressionsForWords(wordCount);
  const others = actions.filter(
    (a) => a.name !== 'play_pose' && a.name !== 'set_expression'
  );
  const poses = actions
    .filter((a) => a.name === 'play_pose')
    .sort((a, b) => a.args.at - b.args.at);
  const exprs = actions
    .filter((a) => a.name === 'set_expression')
    .sort((a, b) => (a.args.at ?? 0) - (b.args.at ?? 0));
  const keptPoses = [];
  for (const p of poses) {
    const last = keptPoses[keptPoses.length - 1];
    if (
      last &&
      last.args.pose === p.args.pose &&
      Math.abs(last.args.at - p.args.at) < 0.05
    ) {
      continue;
    }
    if (keptPoses.length >= maxPoses) {
      console.warn(`[WARNING] Gerak melebihi batas (${maxPoses} untuk ${wordCount} kata), sisanya diabaikan.`);
      break;
    }
    keptPoses.push(p);
  }
  const keptExprs = [];
  for (const e of exprs) {
    const last = keptExprs[keptExprs.length - 1];
    if (last && last.args.emotion === e.args.emotion) continue;
    if (keptExprs.length >= maxExprs) {
      console.warn(`[WARNING] Ekspresi melebihi batas (${maxExprs} untuk ${wordCount} kata), sisanya diabaikan.`);
      break;
    }
    keptExprs.push(e);
  }
  return [...others, ...keptExprs, ...keptPoses];
}

function parseActions(text) {
  let actions = [];
  const tagRe = /^\s*\[([^\]]+)\]\s*/;
  let remaining = text;
  let m;
  while ((m = remaining.match(tagRe))) {
    const action = parseOneTag(m[1]);
    if (action) actions.push(action);
    remaining = remaining.slice(m[0].length);
  }
  const inline = extractInlineTags(remaining);
  actions.push(...inline.cues);
  actions = normalizeActions(actions, countWords(inline.cleanText));
  const hasExpression = actions.some((a) => a.name === 'set_expression');
  if (!hasExpression) {
    console.warn(
      '[WARNING] Tidak ada tag ekspresi sama sekali, fallback ke netral. Teks:',
      text.slice(0, 50)
    );
    actions.unshift({
      name: 'set_expression',
      args: { emotion: 'neutral', at: 0 },
    });
  }

  return { actions, cleanText: inline.cleanText };
}

module.exports = { parseOneTag, parseActions };