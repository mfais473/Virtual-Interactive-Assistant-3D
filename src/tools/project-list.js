const fs = require('fs');
const workspace = require('../workspace/workspace');
const MAX_ENTRIES = 200;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv', 'coverage', '.cache']);
const ctl = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, '?');

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function walk(abs, relBase, depth, maxDepth, out, st) {
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  for (const e of entries) {
    if (out.length >= MAX_ENTRIES) { st.truncated = true; return; }
    const rel = relBase === '.' ? e.name : `${relBase}/${e.name}`;
    if (workspace.policyError(rel.split('/'), 'read')) continue;   // area rahasia: tidak ditampilkan
    const label = ctl(rel);
    if (e.isSymbolicLink()) { out.push(`${label} (symlink, tidak diikuti)`); continue; }
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name.toLowerCase())) { out.push(`${label}/ (dilewati)`); continue; }
      out.push(`${label}/`);
      if (depth < maxDepth) walk(`${abs}/${e.name}`, rel, depth + 1, maxDepth, out, st);
    } else if (e.isFile()) {
      let size = '';
      try { size = `  (${fmtSize(fs.statSync(`${abs}/${e.name}`).size)})`; } catch { /* abaikan */ }
      out.push(`${label}${size}`);
    }
  }
}

const projectList = {
  name: 'project_list',
  description:
    'Melihat daftar file dan folder di dalam folder proyek aktif (tanpa node_modules, .git, dan file rahasia). ' +
    'Path relatif terhadap folder proyek; kosongkan untuk akar proyek.',
  params: {
    path: { type: 'string', required: false, description: 'Sub-folder relatif, mis. src. Kosong = akar proyek' },
    depth: { type: 'string', required: false, description: 'Kedalaman 1-4 (default 2)' },
  },
  permission: 'auto',       
  untrusted: true,          
  taintExempt: true,        
  coding: true,
  describe: ({ path: p }) => `Boleh aku melihat isi folder ${p || 'proyek'}?`,
  validate: ({ path: p }) => {
    const r = workspace.resolveInRoot(p || '.', 'read', { allowRoot: true });
    return r.error || null;
  },
  execute: async ({ path: p, depth }) => {
    const r = workspace.resolveInRoot(p || '.', 'read', { allowRoot: true });
    if (r.error) return { success: false, error: r.error };
    let st;
    try { st = fs.statSync(r.abs); } catch { return { success: false, error: 'Folder tidak ditemukan' }; }
    if (!st.isDirectory()) return { success: false, error: 'Path itu bukan folder' };
    const maxDepth = Math.min(Math.max(parseInt(depth, 10) || 2, 1), 4);
    const out = [];
    const state = { truncated: false };
    walk(r.abs, r.rel, 1, maxDepth, out, state);
    return {
      success: true,
      folder: r.rel,
      returned: out.length,
      truncated: state.truncated,
      text: out.join('\n') || '(kosong)',
    };
  },
};

module.exports = projectList;