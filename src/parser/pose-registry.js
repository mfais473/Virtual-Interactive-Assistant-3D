const fs = require('fs');
const path = require('path');
const MANIFEST_PATH = path.join(__dirname, '..', 'avatar', 'poses.json');
const WORDS_PER_POSE = 6;   // kira-kira satu gerak tiap 10 kata
const MAX_POSES_CAP = 8;     // pengaman untuk balasan sangat panjang

function maxPosesForWords(wordCount) {
  const n = Math.ceil((Number(wordCount) || 0) / WORDS_PER_POSE);
  return Math.min(Math.max(n, 1), MAX_POSES_CAP);
}

let cache = null;

function loadPoses() {
  if (cache) return cache;
  cache = {};
  try {
    const json = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    for (const [name, info] of Object.entries(json.poses ?? {})) {
      cache[name.trim().toLowerCase()] = info ?? {};
    }
  } catch (err) {
    console.error('[pose] Gagal membaca poses.json:', err.message);
  }
  return cache;
}

function isValidPose(name) {
  return Object.prototype.hasOwnProperty.call(loadPoses(), name);
}

function listPoseNames() {
  return Object.keys(loadPoses());
}

function buildPosePromptSection() {
  const poses = loadPoses();
  const names = Object.keys(poses);
  if (names.length === 0) {
    return '  (belum ada gerakan terdaftar -- jangan menulis tag gerak apa pun)';
  }
  return names
    .map((name) => {
      const p = poses[name];
      const head = `  [gerak:${name}] : ${p.desc ?? ''}`.trimEnd();
      return p.example ? `${head}\n      contoh: [gerak:${name}] ${p.example}` : head;
    })
    .join('\n');
}

module.exports = {
  WORDS_PER_POSE,
  MAX_POSES_CAP,
  maxPosesForWords,
  isValidPose,
  listPoseNames,
  buildPosePromptSection,
};
