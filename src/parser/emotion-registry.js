const EMOTION_TAG_MAP = {
  senang: 'happy',
  sedih: 'sad',
  marah: 'angry',
  terkejut: 'surprised',
  tenang: 'relaxed',
  netral: 'neutral',
  antusias: 'happy',
  bingung: 'surprised',
  malu: 'happy',
  jenaka: 'happy',
};
const WORDS_PER_EXPRESSION = 20;  // kira-kira satu emosi tiap 20 kata
const MAX_EXPRESSIONS_CAP = 4;

function maxExpressionsForWords(wordCount) {
  const n = Math.ceil((Number(wordCount) || 0) / WORDS_PER_EXPRESSION);
  return Math.min(Math.max(n, 1), MAX_EXPRESSIONS_CAP);
}

function isEmotionTag(word) {
  return Object.prototype.hasOwnProperty.call(EMOTION_TAG_MAP, word);
}

module.exports = {
  EMOTION_TAG_MAP,
  WORDS_PER_EXPRESSION,
  MAX_EXPRESSIONS_CAP,
  maxExpressionsForWords,
  isEmotionTag,
};
