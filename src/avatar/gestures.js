const GESTURE_REGISTRY = {
  pengenalan: {
    file: 2,
    description:
      'Gerakan memperkenalkan diri atau menunjuk ke arah sesuatu. Pakai saat ' +
      'pertama kali menyapa di sesi baru, atau saat memperkenalkan topik/orang.',
    pairsWith: ['happy', 'neutral'],
    speakStartTime: 3.8,
  },
};

const EMOTION_TAG_MAP = {
  senang: 'happy',
  sedih: 'sad',
  marah: 'angry',
  terkejut: 'surprised',
  tenang: 'relaxed',
  netral: 'neutral',
};

function getGesture(semantic) {
  return GESTURE_REGISTRY[semantic] ?? null;
}

function isValidEmotion(emotion) {
  return Object.values(EMOTION_TAG_MAP).includes(emotion);
}

module.exports = {
  GESTURE_REGISTRY,
  EMOTION_TAG_MAP,
  getGesture,
  isValidEmotion,
};