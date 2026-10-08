const fs = require('fs/promises');
const { extractText } = require('unpdf');
const { dialog, BrowserWindow } = require('electron');

const pdfPickAndRead = {
  name: 'pdf_pick_and_read',
  description: 'Buka dialog untuk memilih file PDF dan membaca isinya. Digunakan ketika pengguna tidak memberikan jalur lengkap.',
  params: {},
  execute: async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Pilih dokumen PDF',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Pengguna membatalkan pemilihan file' };
    }

    const filePath = result.filePaths[0];

    try {
      const buffer = await fs.readFile(filePath);
      // unpdf menerima Uint8Array
      const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });

      return {
        success: true,
        path: filePath,
        text: (text || '').trim().slice(0, 6000),
        truncated: (text || '').length > 6000,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

module.exports = pdfPickAndRead;