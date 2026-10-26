const fs = require('fs');
const workspace = require('../workspace/workspace');
const lineCount = (s) => (s === '' ? 0 : s.split('\n').length);

function planWrite({ path: p, content }) {
  const r = workspace.resolveInRoot(p, 'write');
  if (r.error) return { error: r.error };
  if (typeof content !== 'string') return { error: 'content wajib ada' };
  if (Buffer.byteLength(content, 'utf8') > workspace.MAX_WRITE_BYTES) {
    return { error: `Isi terlalu besar (maks ${workspace.MAX_WRITE_BYTES / 1024} KB)` };
  }
  let existing = null;
  try {
    const lst = fs.lstatSync(r.abs);
    if (lst.isSymbolicLink()) return { error: 'Path ini symlink, tidak boleh ditulis' };
    if (!lst.isFile()) return { error: 'Path itu bukan file' };
    existing = lst;
  } catch { /* belum ada: file baru */ }

  let finalContent = content;
  if (existing) {
    const old = fs.readFileSync(r.abs, 'utf8');
    if (old.includes('\r\n')) finalContent = content.replace(/\r?\n/g, '\r\n');
  }
  return { r, finalContent, existing, mode: existing ? existing.mode & 0o777 : undefined, lines: lineCount(content) };
}

const projectWriteFile = {
  name: 'project_write_file',
  description:
    'Membuat file BARU di folder proyek aktif, atau menimpa seluruh isi file yang ada. Untuk mengubah ' +
    'sebagian file yang sudah ada, pakai project_edit_file. Folder induk dibuat otomatis. ' +
    'Setiap penulisan butuh izin pengguna.',
  params: {
    path: { type: 'string', required: true, description: 'Path relatif file, mis. src/utils/helper.js' },
    content: { type: 'string', required: true, raw: true, allowEmpty: true, description: 'Isi lengkap file' },
  },
  permission: 'confirm',
  alwaysConfirm: true,
  untrusted: false,
  coding: true,
  describe: (args) => {
    const plan = planWrite(args);
    const name = plan.r ? plan.r.rel : String(args.path || 'file');
    if (plan.error) return `Boleh aku menulis file ${name}?`;
    return plan.existing
      ? `Boleh aku MENIMPA seluruh isi file ${name} yang sudah ada dengan ${plan.lines} baris baru?`
      : `Boleh aku membuat file baru ${name} dengan ${plan.lines} baris?`;
  },
  validate: (args) => planWrite(args).error || null,
  execute: async (args) => {
    const plan = planWrite(args);
    if (plan.error) return { success: false, error: plan.error };
    try {
      const backup = plan.existing ? workspace.backupBeforeWrite(plan.r.abs, plan.r.rel) : null;
      workspace.writeFileAtomic(plan.r.abs, plan.finalContent, plan.mode);
      console.log(`[project] tulis ${plan.r.rel}` + (backup ? ` (backup: ${backup})` : ''));
      return {
        success: true,
        path: plan.r.rel,
        created: !plan.existing,
        lines: plan.lines,
        backupSaved: Boolean(backup),
        message: plan.existing ? `File ${plan.r.rel} ditimpa` : `File ${plan.r.rel} dibuat`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

module.exports = projectWriteFile;
module.exports.__test = { planWrite };