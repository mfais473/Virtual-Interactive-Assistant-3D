const fs = require('fs');
const workspace = require('../workspace/workspace');
const DEFAULT_LINES = 200;
const MAX_LINES = 400;
const MAX_CHARS = 30000;
const projectReadFile = {
  name: 'project_read_file',
  description:
    'Membaca isi sebuah file teks di dalam folder proyek aktif. Path RELATIF terhadap folder proyek. ' +
    'Hasil dipotong per bagian: bila "complete" false, lanjutkan dengan startLine = nextStartLine. ' +
    'Jangan menyimpulkan isi bagian yang belum dibaca. File rahasia (.env, kunci) tidak bisa dibaca.',
  params: {
    path: { type: 'string', required: true, description: 'Path relatif file, mis. src/app.js' },
    startLine: { type: 'string', required: false, description: 'Mulai dari baris ke-berapa (default 1)' },
    maxLines: { type: 'string', required: false, description: `Jumlah baris (default ${DEFAULT_LINES}, maks ${MAX_LINES})` },
  },
  permission: 'auto',       
  untrusted: true,          
  taintExempt: true,
  coding: true,
  describe: ({ path: p }) => `Boleh aku membaca file ${p || 'proyek'}?`,
  validate: ({ path: p }) => {
    const r = workspace.resolveInRoot(p, 'read');
    return r.error || null;
  },
  execute: async ({ path: p, startLine, maxLines }) => {
    const r = workspace.resolveInRoot(p, 'read');
    if (r.error) return { success: false, error: r.error };
    try {
      const st = fs.statSync(r.abs);
      if (!st.isFile()) return { success: false, error: 'Path itu bukan file' };
      if (st.size > workspace.MAX_READ_BYTES) {
        return { success: false, error: `File terlalu besar (${Math.round(st.size / 1024)} KB, maks ${workspace.MAX_READ_BYTES / 1024} KB)` };
      }
      const buf = fs.readFileSync(r.abs);
      if (workspace.looksBinary(buf)) return { success: false, error: 'File ini biner, bukan teks' };
      const raw = buf.toString('utf8');
      const eol = raw.includes('\r\n') ? 'CRLF' : 'LF';
      const lines = raw.replace(/\r\n/g, '\n').split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      const start = Math.max(parseInt(startLine, 10) || 1, 1);
      const want = Math.min(Math.max(parseInt(maxLines, 10) || DEFAULT_LINES, 1), MAX_LINES);
      let chunk = lines.slice(start - 1, start - 1 + want);
      let text = chunk.join('\n');
      while (text.length > MAX_CHARS && chunk.length > 1) {
        chunk = chunk.slice(0, Math.ceil(chunk.length * 0.8));
        text = chunk.join('\n');
      }
      const end = start - 1 + chunk.length;
      const complete = start === 1 && end >= lines.length;
      const result = {
        success: true,
        path: r.rel,
        totalLines: lines.length,
        startLine: start,
        endLine: end,
        eol,
        complete,
        text,
      };
      if (end < lines.length) result.nextStartLine = end + 1;
      if (!complete) result.note = 'Ini baru sebagian file. Jangan mengedit berdasarkan bagian yang belum kamu baca.';
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

module.exports = projectReadFile;