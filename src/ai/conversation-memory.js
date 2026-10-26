const MAX_TURNS = 10;

let history = [];

/** @returns {Array<{role:'user'|'assistant', content:string}>} salinan riwayat */
function getHistory() {
  return history.map((m) => ({ ...m }));
}

/**
 * Tambah 1 turn lalu buang turn tertua jika melebihi MAX_TURNS.
 * Turn dengan teks kosong (user atau asisten) diabaikan agar riwayat
 * tetap berpasangan user/assistant.
 */
function appendTurn(userText, assistantText) {
  const u = (userText || '').trim();
  const a = (assistantText || '').trim();
  if (!u || !a) return;

  history.push({ role: 'user', content: u });
  history.push({ role: 'assistant', content: a });

  const maxMessages = MAX_TURNS * 2;
  if (history.length > maxMessages) {
    history = history.slice(history.length - maxMessages);
  }
}

/** Kosongkan riwayat (untuk testing). */
function resetHistory() {
  history = [];
}

module.exports = { getHistory, appendTurn, resetHistory, MAX_TURNS };
