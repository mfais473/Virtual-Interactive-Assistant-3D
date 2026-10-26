const path = require('path');
const fs = require('fs/promises');
const { extractText } = require('unpdf');
const { isInsideAllowed } = require('./path-guard');
const MAX_BYTES = 50 * 1024 * 1024;
const readPdf = {
  name: 'read_pdf',
  description:
    'Membaca isi dokumen PDF dari path lengkap dan mengembalikan teksnya. ' +
    'Pakai HANYA kalau pengguna menyebut path lengkap, misalnya ' +
    '"C:\\Users\\Me\\Documents\\laporan.pdf". Kalau pengguna hanya bilang ' +
    '"baca PDF ini" tanpa path, pakai pdf_pick_and_read.',
  params: {
    path: { type: 'string', required: true, description: 'Path lengkap file .pdf' },
  },
  permission: 'confirm',   
  untrusted: true,         
  describe: ({ path: p }) =>
    `Boleh aku baca isi file ${p ? path.basename(p) : 'PDF itu'}? Isinya akan dikirim ke layanan AI.`,
  toArtifact: (args, result) => ({ type: 'pdf', path: result.path, pages: result.pages }),
  execute: async ({ path: filePath }) => {
    if (!filePath) return { success: false, error: 'Path kosong' };
    if (!filePath.toLowerCase().endsWith('.pdf')) {
      return { success: false, error: 'Hanya file .pdf yang didukung' };
    }
    if (!isInsideAllowed(filePath)) {
      return { success: false, error: 'File di luar area yang diizinkan' };
    }
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_BYTES) {
        return { success: false, error: 'File PDF terlalu besar (maks 50 MB)' };
      }
      const buffer = await fs.readFile(filePath);
      const { text, totalPages } = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });
      const cleanText = (text || '').trim();
      return {
        success: true,
        path: filePath,
        pages: totalPages,
        length: cleanText.length,
        text: cleanText.slice(0, 6000),
        truncated: cleanText.length > 6000,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

module.exports = readPdf;