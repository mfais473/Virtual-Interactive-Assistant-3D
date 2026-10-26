const path = require('path');
const os = require('os');
const fg = require('fast-glob');
const { isInsideAllowed } = require('./path-guard');

const findFiles = {
  name: 'find_files',
  description:
    'Mencari file di komputer berdasarkan pola nama atau ekstensi. Contoh: ' +
    'cari semua file PDF, cari file bernama "laporan", cari file .docx di Documents. ' +
    'Hanya mencari di dalam folder yang diizinkan (default: folder home pengguna).',
  params: {
    pattern: { type: 'string', required: true, description: 'Pola pencarian, contoh: *.pdf, laporan*.docx' },
    folder:  { type: 'string', required: false, description: 'Folder awal (default: home user)' },
    limit:   { type: 'string', required: false, description: 'Maksimal hasil (default 20)' },
  },
  permission: 'auto',     
  untrusted: true,         
  describe: ({ pattern }) => `Boleh aku mencari file dengan pola ${pattern || 'tertentu'} di komputer kamu?`,
  execute: async ({ pattern, folder, limit }) => {
    if (!pattern) return { success: false, error: 'Pattern kosong' };
    if (pattern.includes('..') || path.isAbsolute(pattern)) {
      return { success: false, error: 'Pola tidak boleh berisi ".." atau path absolut' };
    }
    const cwd = folder || os.homedir();
    if (!isInsideAllowed(cwd)) {
      return { success: false, error: 'Folder di luar area yang diizinkan' };
    }
    const max = Math.min(parseInt(limit, 10) || 20, 100);
    try {
      const files = await fg(pattern, {
        cwd,
        absolute: true,
        onlyFiles: true,
        deep: 6,
        followSymbolicLinks: false,
        ignore: ['**/node_modules/**', '**/AppData/**', '**/.git/**'],
        suppressErrors: true,
      });
      const safe = files.filter(isInsideAllowed);
      const results = safe.slice(0, max);
      return {
        success: true,
        folder: cwd,
        pattern,
        total: safe.length,
        returned: results.length,
        files: results,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

module.exports = findFiles;