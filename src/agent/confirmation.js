const APPROVE_PHRASES = [
  'tidak masalah', 'nggak masalah', 'gak masalah', 'ga masalah', 'enggak masalah',
  'tidak apa apa', 'nggak apa apa', 'gak apa apa', 'ga apa apa', 'enggak apa apa',
  'tidak keberatan', 'nggak keberatan', 'gak keberatan',
];
const DENY = new Set([
  'tidak', 'tak', 'nggak', 'ngga', 'enggak', 'engga', 'gak', 'ga', 'jangan',
  'batal', 'batalkan', 'belum', 'stop', 'cancel', 'no', 'nope', 'tolak', 'skip', 'nanti',
  'bukan', 'gausah',
]);
const HOLD = new Set(['tunggu', 'dulu', 'sebentar', 'bentar', 'wait', 'hold', 'pending']);
const ASK = new Set(['tanya', 'nanya', 'bertanya', 'tanyakan', 'nanyain', 'tanyaku', 'pertanyaan']);
const QUESTION_WORDS = new Set([
  'apa', 'apakah', 'kenapa', 'mengapa', 'bagaimana', 'gimana', 'gmn', 'siapa', 'kapan', 'dimana',
  'berapa', 'mana', 'maksudnya', 'jelaskan', 'jelasin',
]);
const SOFT_DENY = new Set(['belum', 'nanti']);
const HARD_DENY = new Set(['batal', 'batalkan', 'cancel', 'stop', 'tolak']);
const STRONG_APPROVE = new Set([
  'ya', 'iya', 'yes', 'yap', 'yup', 'yoi', 'silakan', 'silahkan', 'oke', 'ok', 'okay',
  'okey', 'sip', 'setuju', 'lanjut', 'lanjutkan', 'gas', 'tentu', 'siap',
]);
const WEAK_APPROVE = new Set([
  'buka', 'ambil', 'baca', 'lihat', 'jalankan', 'eksekusi', 'cari', 'mau', 'bisa',
  'boleh', 'baik', 'benar', 'betul',
]);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensOf(text) {
  let t = ' ' + normalize(text) + ' ';
  for (const phrase of APPROVE_PHRASES) {
    t = t.split(' ' + phrase + ' ').join(' ya ');
  }
  return t.split(' ').filter(Boolean);
}

/**
 * @param {string} text jawaban pengguna
 * @param {{strict?: boolean}} [opts] strict: untuk aksi yang MENULIS (apply_patch, rencana).
 *   Hanya persetujuan tegas ("ya", "oke", "lanjut", ...) yang dianggap setuju; kata yang sekadar
 *   menggaungkan pertanyaan ("baca", "bisa", "mau") tidak cukup, dan kata penahan ("dulu",
 *   "tunggu") menjadi 'ask'.
 * @returns {'approve'|'deny'|'ask'|'unclear'}
 */
function classifyConfirmation(text, { strict = false } = {}) {
  const tokens = tokensOf(text);
  if (!tokens.length) return 'unclear';

  const hasHardDeny = tokens.some((w) => DENY.has(w) && !SOFT_DENY.has(w));
  const hasSoftDeny = tokens.some((w) => SOFT_DENY.has(w));
  const hasDeny = hasHardDeny || hasSoftDeny;
  const hasStrong = tokens.some((w) => STRONG_APPROVE.has(w));
  const hasWeak = tokens.some((w) => WEAK_APPROVE.has(w));
  const hasHold = tokens.some((w) => HOLD.has(w));
  const hasAsk = tokens.some((w) => ASK.has(w));

  if (hasDeny && hasStrong) return 'unclear';   
  if (hasHardDeny) return 'deny';               
  if (hasAsk || (hasSoftDeny && hasHold)) return 'ask';
  if (hasSoftDeny) return 'deny';
  if (hasHold && hasStrong) return 'ask';       
  if (strict) {
    if (hasHold) return 'ask';                  
    return hasStrong ? 'approve' : 'unclear';
  }
  if (hasStrong || hasWeak) return 'approve';  
  if (hasHold) return 'ask';
  return 'unclear';
}

/** Ucapan memuat tanda tanya atau kata tanya (bukan sekadar "tanya dulu"). */
function looksLikeQuestion(text) {
  return /\?/.test(String(text)) || tokensOf(text).some((w) => QUESTION_WORDS.has(w));
}

/**
 * Pembacaan jawaban SELAMA MODE TANYA (pengguna sedang bertanya soal izin yang menunggu).
 * Hanya keputusan yang jelas (ya/tidak pendek, tanpa tanda tanya) yang mengakhiri mode tanya;
 * selain itu = pertanyaan. Pertanyaan TIDAK PERNAH dihitung sebagai persetujuan.
 * @returns {'approve'|'deny'|'question'}
 */
function classifyInquiry(text, { strict = false } = {}) {
  const tokens = tokensOf(text);
  if (!tokens.length) return 'question';
  if (tokens.some((w) => HARD_DENY.has(w)) && !tokens.some((w) => STRONG_APPROVE.has(w))) return 'deny';
  if (looksLikeQuestion(text)) return 'question';
  const c = classifyConfirmation(text, { strict });
  return c === 'approve' || c === 'deny' ? c : 'question';
}

const SHORTCUT_LABEL = { approve: '[tombol Y]', deny: '[tombol N]', ask: '[tombol T]' };

/** Payload shortcut keyboard {decision} -> { decision, label } atau null bila tidak valid. */
function shortcutDecision(payload) {
  const d = payload && typeof payload === 'object' ? payload.decision : undefined;
  return Object.prototype.hasOwnProperty.call(SHORTCUT_LABEL, d) ? { decision: d, label: SHORTCUT_LABEL[d] } : null;
}

module.exports = { classifyConfirmation, classifyInquiry, looksLikeQuestion, shortcutDecision, normalize };
