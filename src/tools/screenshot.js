const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const screenshot = require('screenshot-desktop');
const { setLastScreenshotPath } = require('./state-screenshot');

const screenshotTool = {
  name: 'screenshot',
  description:
    'Mengambil screenshot layar dan menyimpannya ke file PNG. Pakai saat ' +
    'pengguna minta screenshot, tangkapan layar, atau menyimpan tampilan sekarang.',
  params: {
    saveAs: { type: 'string', required: false, description: 'Path output (opsional)' },
    screen: { type: 'string', required: false, description: '0 untuk layar utama, atau "all" untuk semua layar' },
  },
  execute: async ({ saveAs, screen }) => {
    try {
      const dir = path.join(os.homedir(), 'Pictures');
      await fs.mkdir(dir, { recursive: true }).catch(() => {});

      const defaultName = `screenshot-${Date.now()}.png`;
      const outPath = saveAs || path.join(dir, defaultName);

      let buffer;
      if (screen === 'all') {
        const displays = await screenshot.all();
        // Ambil layar pertama saja (gabungan butuh lib tambahan)
        buffer = displays[0];
      } else {
        buffer = await screenshot({ format: 'png' });
      }

      await fs.writeFile(outPath, buffer);
      setLastScreenshotPath(outPath);

      return {
        success: true,
        path: outPath,
        size: buffer.length,
        message: `Screenshot disimpan di ${outPath}`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

module.exports = screenshotTool;