const { shell } = require('electron');

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
  try {
    const u = new URL(target);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

const openBrowser = {
  name: 'open_browser',
  description:
    'Membuka sebuah URL di browser default pengguna. Pakai saat pengguna minta ' +
    'membuka website, mencari sesuatu di Google, atau menampilkan link.',
  params: {
    url: { type: 'string', required: true, description: 'URL lengkap, contoh: https://google.com' },
  },
  permission: 'confirm',
  untrusted: false,
  describe: ({ url }) => {
    const u = normalizeUrl(url);
    return u
      ? `Boleh aku buka ${u.hostname} di browser kamu?`
      : 'Boleh aku buka sebuah alamat web di browser kamu?';
  },
  execute: async ({ url }) => {
    if (!url) return { success: false, error: 'URL kosong' };
    const u = normalizeUrl(url);
    if (!u) return { success: false, error: `URL tidak valid atau bukan http/https: ${url}` };
    await shell.openExternal(u.href);
    return { success: true, message: `Membuka ${u.href}` };
  },
};

module.exports = openBrowser;
module.exports.normalizeUrl = normalizeUrl;