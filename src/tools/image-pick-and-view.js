const fs = require('fs/promises');
const path = require('path');
const { dialog, BrowserWindow, nativeImage } = require('electron');
const MAX_INPUT_BYTES = 30 * 1024 * 1024;
const SAFE_BYTES = 4 * 1024 * 1024;   // di atas ini gambar diperkecil (batas provider ~5 MB)
const MAX_SIDE = 2000;
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
};

function shrinkIfNeeded(buffer, mimeType) {
  if (buffer.length <= SAFE_BYTES) return { buffer, mimeType };
  let img = nativeImage.createFromBuffer(buffer);
  if (img.isEmpty()) return { buffer, mimeType };
  const { width, height } = img.getSize();
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  if (scale < 1) img = img.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
  return { buffer: img.toJPEG(85), mimeType: 'image/jpeg' };
}

const imagePickAndView = {
  name: 'image_pick_and_view',
  description:
    'Membuka dialog agar pengguna memilih file gambar (foto, scan, tabel, nota) lalu ' +
    'melihat isinya untuk dianalisis. Pakai saat pengguna ingin menganalisis atau mengambil ' +
    'data dari gambar miliknya (bukan screenshot).',
  params: {},
  permission: 'auto',   // pengguna memilih sendiri filenya lewat dialog
  untrusted: true,      // teks di dalam gambar bisa berisi instruksi palsu
  describe: () => 'Boleh aku membuka jendela pemilih gambar?',
  execute: async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Pilih gambar',
      filters: [{ name: 'Gambar', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Pengguna membatalkan pemilihan gambar' };
    }
    const filePath = result.filePaths[0];
    const mimeType = MIME[path.extname(filePath).toLowerCase()];
    if (!mimeType) return { success: false, error: 'Format gambar tidak didukung' };
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_INPUT_BYTES) return { success: false, error: 'Gambar terlalu besar (maks 30 MB)' };
      const raw = await fs.readFile(filePath);
      const out = shrinkIfNeeded(raw, mimeType);
      return {
        success: true,
        path: filePath,
        imageBase64: out.buffer.toString('base64'),
        imageMimeType: out.mimeType,
        message: 'Gambar berhasil dibaca',
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

module.exports = imagePickAndView;
