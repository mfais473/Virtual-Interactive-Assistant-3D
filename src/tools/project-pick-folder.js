const workspace = require('../workspace/workspace');
const projectPickFolder = {
  name: 'project_pick_folder',
  description:
    'Membuka dialog agar pengguna memilih FOLDER PROYEK. Pakai saat pengguna ingin kamu membaca, ' +
    'mengubah, atau mengupgrade proyek/kode di komputernya dan belum ada "Folder Proyek Aktif", ' +
    'atau saat ia ingin berganti proyek. Setelah dipilih, tool project_* hanya bisa menyentuh isi ' +
    'folder itu.',
  params: {},
  permission: 'auto',   // pengguna memilih sendiri folder lewat dialog
  untrusted: false,
  coding: true,         // langkah berikutnya memakai model coding
  describe: () => 'Boleh aku membuka jendela pemilih folder proyek?',
  execute: async () => {
    const { dialog, BrowserWindow } = require('electron');   // dimuat saat dipakai (modul ini bisa diuji tanpa Electron)
    const win = BrowserWindow.getFocusedWindow();
    const options = { title: 'Pilih folder proyek', properties: ['openDirectory'] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Pengguna membatalkan pemilihan folder' };
    }
    const set = workspace.setRoot(result.filePaths[0]);
    if (set.error) return { success: false, error: set.error };
    return {
      success: true,
      folder: set.name,
      message: `Folder proyek "${set.name}" dipilih. Mulai sekarang kamu hanya bisa membaca/mengubah isi folder ini.`,
    };
  },
};

module.exports = projectPickFolder;