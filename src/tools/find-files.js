const path = require('path');
const os = require('os');
const fg = require('fast-glob');

const findFiles = {
  name: 'find_files',
  description:
    'Mencari file di komputer berdasarkan pola nama atau ekstensi. Contoh: ' +
    'cari semua file PDF, cari file bernama "laporan", cari file .docx di Documents.',
  params: {
    pattern: { type: 'string', required: true, description: 'Pola pencarian, contoh: *.pdf, laporan*.docx' },
    folder:  { type: 'string', required: false, description: 'Folder awal (default: home user)' },
    limit:   { type: 'string', required: false, description: 'Maksimal hasil (default 20)' },
  },
  execute: async ({ pattern, folder, limit }) => {
    if (!pattern) return { success: false, error: 'Pattern kosong' };

    const cwd = folder || os.homedir();
    const max = Math.min(parseInt(limit, 10) || 20, 100);

    try {
      const files = await fg(pattern, {
        cwd,
        absolute: true,
        onlyFiles: true,
        deep: 6,
        ignore: ['**/node_modules/**', '**/AppData/**', '**/.git/**'],
        suppressErrors: true,
      });

      const results = files.slice(0, max);

      return {
        success: true,
        folder: cwd,
        pattern,
        total: files.length,
        returned: results.length,
        files: results,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

module.exports = findFiles;