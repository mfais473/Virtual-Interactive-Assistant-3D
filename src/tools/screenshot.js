const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const screenshot = require('screenshot-desktop');
const { setLastScreenshotPath } = require('./state-screenshot');
const { isInsideAllowed } = require('./path-guard');
const screenshotTool = {
  name: 'screenshot',
  description:
    'Mengambil screenshot layar dan menyimpannya ke file PNG. Pakai saat ' +
    'pengguna minta screenshot, tangkapan layar, atau menyimpan tampilan sekarang.',
  params: {
    saveAs: { type: 'string', required: false, description: 'Path output .png (opsional, default folder Pictures)' },
    screen: { type: 'string', required: false, description: '0 untuk layar utama, atau "all" untuk semua layar' },
  },
  permission: 'confirm',   // menangkap isi layar (bisa berisi data sensitif)
  untrusted: false,
  describe: ({ saveAs }) =>
    saveAs
      ? `Boleh aku ambil screenshot layar kamu dan simpan sebagai ${path.basename(saveAs)}?`
      : 'Boleh aku ambil screenshot layar kamu dan simpan di folder Pictures?',
  toArtifact: (args, result) => ({ type: 'screenshot', path: result.path }),
  execute: async ({ saveAs, screen }) => {
    try {
      const dir = path.join(os.homedir(), 'Pictures');
      await fs.mkdir(dir, { recursive: true }).catch(() => {});
      const outPath = saveAs ? path.resolve(saveAs) : path.join(dir, `screenshot-${Date.now()}.png`);
      if (!outPath.toLowerCase().endsWith('.png')) {
        return { success: false, error: 'Output harus berekstensi .png' };
      }
      if (!isInsideAllowed(outPath)) {
        return { success: false, error: 'Lokasi simpan di luar area yang diizinkan' };
      }
      let buffer;
      if (screen === 'all') {
        const displays = await screenshot.all();
        buffer = displays[0]; // gabungan butuh lib tambahan
      } else {
        buffer = await screenshot({ format: 'png' });
      }
      await fs.writeFile(outPath, buffer, { flag: 'wx' });
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