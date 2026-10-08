const fs = require('fs/promises');
const { getLastScreenshotPath } = require('./state-screenshot');

const viewScreenshot = {
  name: 'view_screenshot',
  description:
    'Melihat isi screenshot terakhir yang baru diambil agar kamu bisa menganalisis ' +
    'atau menjelaskan apa yang ada di dalamnya. Pakai HANYA saat pengguna minta ' +
    'analisis screenshot, tanya isinya, atau minta penjelasan tentang yang tampak.',
  params: {},
  execute: async () => {
    const p = getLastScreenshotPath();
    if (!p) return { success: false, error: 'Belum ada screenshot yang diambil' };

    try {
      const buffer = await fs.readFile(p);
      return {
        success: true,
        path: p,
        imageBase64: buffer.toString('base64'),
        imageMimeType: 'image/png',
        message: 'Screenshot berhasil dibaca',
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

module.exports = viewScreenshot;