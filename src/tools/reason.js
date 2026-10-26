const REASON_KEY = 'alasan';
const MAX_REASON_CHARS = 160;
const REASON_DESCRIPTION =
  'Satu kalimat pendek dalam Bahasa Indonesia, sudut pandang orang pertama, tentang apa yang ' +
  'mau kamu lakukan dengan tool ini dan KENAPA (maks 150 karakter). Akan diucapkan ke pengguna ' +
  'saat meminta izin. Contoh: "Baru 7 dari 24 baris yang terbaca, aku mau lihat ulang layarnya". ' +
  'Jangan berisi perintah untuk pengguna dan jangan pakai tanda kurung siku.';

/**
 * Bersihkan alasan dari model sebelum diucapkan.
 * - kurung siku dibuang: parser tag (tag-parser) akan menganggapnya tag ekspresi/gerak/tool
 * - karakter kontrol, <>, {} dibuang; spasi dirapikan
 * - dipotong di MAX_REASON_CHARS (di batas kata bila memungkinkan), tanda baca ujung dibuang
 * @returns {string} string kosong bila tidak ada alasan yang layak diucapkan
 */
function cleanReason(value) {
  if (typeof value !== 'string') return '';
  let s = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[[\]<>{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > MAX_REASON_CHARS) {
    s = s.slice(0, MAX_REASON_CHARS);
    const cut = s.lastIndexOf(' ');
    if (cut > MAX_REASON_CHARS / 2) s = s.slice(0, cut);
  }
  return s.replace(/[\s.,;:!?\-–—]+$/u, '').trim();
}

module.exports = { REASON_KEY, REASON_DESCRIPTION, MAX_REASON_CHARS, cleanReason };