const fs = require('fs/promises');
const { extractText } = require('unpdf');

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
  execute: async ({ path: filePath }) => {
    if (!filePath) return { success: false, error: 'Path kosong' };
    if (!filePath.toLowerCase().endsWith('.pdf')) {
      return { success: false, error: 'Hanya file .pdf yang didukung' };
    }

    try {
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