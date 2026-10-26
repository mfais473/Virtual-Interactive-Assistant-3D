const fs = require('fs');
const workspace = require('../workspace/workspace');
const MAX_OLD_CHARS = 50000;
const MAX_NEW_CHARS = 200000;
const lineCount = (s) => (s === '' ? 0 : s.split('\n').length);

function countOccurrences(hay, needle) {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

function planEdit({ path: p, oldText, newText, replaceAll }) {
  const r = workspace.resolveInRoot(p, 'write');
  if (r.error) return { error: r.error };
  if (typeof oldText !== 'string' || oldText === '') return { error: 'oldText kosong. Untuk file baru pakai project_write_file' };
  if (typeof newText !== 'string') return { error: 'newText wajib ada (boleh kosong untuk menghapus teks)' };
  if (oldText.length > MAX_OLD_CHARS || newText.length > MAX_NEW_CHARS) return { error: 'Teks terlalu panjang, pecah menjadi beberapa edit kecil' };
  let lst;
  try { lst = fs.lstatSync(r.abs); } catch { return { error: 'File belum ada. Untuk membuat file baru pakai project_write_file' }; }
  if (lst.isSymbolicLink()) return { error: 'File ini symlink, tidak boleh diubah' };
  if (!lst.isFile()) return { error: 'Path itu bukan file' };
  if (lst.size > workspace.MAX_WRITE_BYTES) return { error: 'File terlalu besar untuk diedit' };
  const buf = fs.readFileSync(r.abs);
  if (workspace.looksBinary(buf)) return { error: 'File ini biner, bukan teks' };
  const content = buf.toString('utf8');
  // Byte yang bukan UTF-8 sah (mis. Latin-1/Windows-1252) berubah jadi U+FFFD saat didekode, lalu
  // tertulis permanen saat disimpan. Tolak daripada merusak karakter di bagian file yang tidak diedit.
  if (!Buffer.from(content, 'utf8').equals(buf)) {
    return { error: 'File ini bukan UTF-8 murni (mungkin Latin-1/ANSI), tidak aman diedit karena karakternya bisa rusak' };
  }
  const crlf = content.includes('\r\n');
  const fit = (s) => (crlf ? s.replace(/\r?\n/g, '\r\n') : s.replace(/\r\n/g, '\n'));
  const oldFit = fit(oldText);
  const newFit = fit(newText);
  if (oldFit === newFit) return { error: 'Tidak ada perubahan (teks lama sama dengan teks baru)' };
  const count = countOccurrences(content, oldFit);
  if (count === 0) {
    return { error: 'oldText tidak ditemukan di file (spasi/indentasi harus persis). Baca ulang file lalu coba lagi' };
  }
  const all = String(replaceAll).toLowerCase() === 'true';
  if (count > 1 && !all) {
    return { error: `oldText ditemukan ${count} kali. Tambahkan konteks di sekitarnya agar unik, atau set replaceAll=true` };
  }
  let updated;
  if (all) {
    updated = content.split(oldFit).join(newFit);
  } else {
    const i = content.indexOf(oldFit);
    updated = content.slice(0, i) + newFit + content.slice(i + oldFit.length);
  }
  if (Buffer.byteLength(updated, 'utf8') > workspace.MAX_WRITE_BYTES) return { error: 'Hasil edit terlalu besar' };
  return {
    r, updated, mode: lst.mode & 0o777,
    replacements: all ? count : 1,
    linesRemoved: lineCount(oldText), linesAdded: lineCount(newText),
  };
}

const projectEditFile = {
  name: 'project_edit_file',
  description:
    'Mengubah file yang SUDAH ADA di folder proyek aktif dengan mengganti satu potong teks persis ' +
    '(oldText -> newText). Selalu baca file dulu (project_read_file), lalu salin oldText PERSIS ' +
    '(termasuk spasi/indentasi) dengan sedikit konteks agar unik. newText boleh kosong untuk menghapus. ' +
    'Pakai ini, bukan project_write_file, untuk file yang sudah ada. Setiap edit butuh izin pengguna.',
  params: {
    path: { type: 'string', required: true, description: 'Path relatif file, mis. src/app.js' },
    oldText: { type: 'string', required: true, raw: true, description: 'Teks lama persis seperti di file (harus unik, kecuali replaceAll)' },
    newText: { type: 'string', required: true, raw: true, allowEmpty: true, description: 'Teks pengganti (kosong = hapus)' },
    replaceAll: { type: 'string', required: false, description: '"true" untuk mengganti semua kemunculan' },
  },
  permission: 'confirm',
  alwaysConfirm: true,      
  untrusted: false,
  coding: true,
  describe: (args) => {
    const plan = planEdit(args);
    const name = plan.r ? plan.r.rel : String(args.path || 'file');
    if (plan.error) return `Boleh aku mengubah file ${name}?`;
    return `Boleh aku mengubah file ${name}: mengganti ${plan.linesRemoved} baris dengan ${plan.linesAdded} baris` +
      (plan.replacements > 1 ? `, di ${plan.replacements} tempat?` : '?');
  },
  validate: (args) => planEdit(args).error || null,
  execute: async (args) => {
    const plan = planEdit(args);
    if (plan.error) return { success: false, error: plan.error };
    try {
      const backup = workspace.backupBeforeWrite(plan.r.abs, plan.r.rel);
      workspace.writeFileAtomic(plan.r.abs, plan.updated, plan.mode);
      console.log(`[project] edit ${plan.r.rel}` + (backup ? ` (backup: ${backup})` : ''));
      return {
        success: true,
        path: plan.r.rel,
        replacements: plan.replacements,
        linesRemoved: plan.linesRemoved,
        linesAdded: plan.linesAdded,
        backupSaved: Boolean(backup),
        message: `File ${plan.r.rel} diubah`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

module.exports = projectEditFile;
module.exports.__test = { planEdit };