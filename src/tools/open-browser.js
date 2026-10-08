const { shell } = require('electron');

const openBrowser = {
  name: 'open_browser',
  description:
    'Membuka sebuah URL di browser default pengguna. Pakai saat pengguna minta ' +
    'membuka website, mencari sesuatu di Google, atau menampilkan link.',
  params: {
    url: { type: 'string', required: true, description: 'URL lengkap, contoh: https://google.com' },
  },
  execute: async ({ url }) => {
    if (!url) return { success: false, error: 'URL kosong' };

    let target = url.trim();
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

    try {
      new URL(target); // validasi
    } catch {
      return { success: false, error: `URL tidak valid: ${target}` };
    }

    await shell.openExternal(target);
    return { success: true, message: `Membuka ${target}` };
  },
};

module.exports = openBrowser;