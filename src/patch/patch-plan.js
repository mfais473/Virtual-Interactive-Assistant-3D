'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const workspace = require('../workspace/workspace');
const LIMITS = Object.freeze({
  MAX_OPERATIONS: 100,        
  MAX_FILES: 10,              
  MAX_LINES: 50000,             
  MAX_OLD_CHARS: 500000,
  MAX_NEW_CHARS: 2000000,
  MAX_TOTAL_BYTES: 2 * 1024 * 1024,   
});
const DEPENDENCY_FILES = new Set(['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);
const OP_KINDS = ['edit', 'create', 'delete', 'rename'];

/** Jumlah baris sebuah teks. '' = 0; "a\n" = 1; "a\nb" = 2. */
function countLines(s) {
  if (!s) return 0;
  const n = s.split('\n').length;
  return s.endsWith('\n') ? n - 1 : n;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';
const pathKey = (rel) => (CASE_INSENSITIVE ? rel.toLowerCase() : rel);

function countOccurrences(hay, needle) {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

function eolOf(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  return crlf > lf ? 'crlf' : 'lf';
}

const fitEol = (s, eol) => (eol === 'crlf' ? s.replace(/\r?\n/g, '\r\n') : s.replace(/\r\n/g, '\n'));

/** JSON kanonik (kunci diurutkan) supaya digest stabil. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * Terima array operasi atau string JSON-nya. Mengembalikan operasi yang sudah dinormalisasi
 * (hanya kolom yang dikenal) atau {error}.
 */
function parseOperations(input) {
  let list = input;
  if (typeof input === 'string') {
    try { list = JSON.parse(input); } catch { return { error: 'operations bukan JSON yang valid' }; }
  }
  if (list && !Array.isArray(list) && Array.isArray(list.operations)) list = list.operations;
  if (!Array.isArray(list)) return { error: 'operations harus berupa array operasi' };
  if (list.length === 0) return { error: 'operations kosong' };
  if (list.length > LIMITS.MAX_OPERATIONS) {
    return { error: `Terlalu banyak operasi (${list.length}; maks ${LIMITS.MAX_OPERATIONS} per patch)` };
  }

  const ops = [];
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    const at = `Operasi #${i + 1}`;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { error: `${at}: harus berupa objek` };
    if (!OP_KINDS.includes(o.op)) return { error: `${at}: "op" harus salah satu dari ${OP_KINDS.join(', ')}` };
    const needStr = (k) => typeof o[k] === 'string' && o[k].trim() !== '';
    if (o.op === 'rename') {
      if (!needStr('from') || !needStr('to')) return { error: `${at}: rename butuh "from" dan "to"` };
      ops.push({ op: 'rename', from: o.from.trim(), to: o.to.trim() });
      continue;
    }
    if (!needStr('path')) return { error: `${at}: "path" wajib ada` };
    const p = o.path.trim();
    if (o.op === 'delete') {
      ops.push({ op: 'delete', path: p });
    } else if (o.op === 'create') {
      if (typeof o.content !== 'string') return { error: `${at}: create butuh "content" berupa teks` };
      ops.push({ op: 'create', path: p, content: o.content });
    } else {
      if (typeof o.oldText !== 'string' || o.oldText === '') return { error: `${at}: edit butuh "oldText" yang tidak kosong` };
      if (typeof o.newText !== 'string') return { error: `${at}: edit butuh "newText" (boleh kosong untuk menghapus)` };
      const all = o.replaceAll === true || String(o.replaceAll).toLowerCase() === 'true';
      ops.push({ op: 'edit', path: p, oldText: o.oldText, newText: o.newText, replaceAll: all });
    }
  }
  return { ops };
}

/** Ambil (atau muat sekali) keadaan sebuah file. Satu entri per path unik. */
function touch(st, relInput) {
  const r = workspace.resolveInRoot(relInput, 'write');
  if (r.error) return { error: `${relInput}: ${r.error}` };
  const key = pathKey(r.rel);
  const have = st.entries.get(key);
  if (have) return { e: have };
  if (st.entries.size >= LIMITS.MAX_FILES) {
    return { error: `Patch menyentuh lebih dari ${LIMITS.MAX_FILES} file (rename menghitung dua path)` };
  }
  let lst = null;
  try {
    lst = fs.lstatSync(r.abs);
  } catch (err) {
    if (err.code !== 'ENOENT') return { error: `${r.rel}: tidak bisa diperiksa (${err.code || err.message})` };
  }
  let before = null;
  if (lst) {
    if (lst.isSymbolicLink()) return { error: `${r.rel}: symlink tidak boleh diubah lewat patch` };
    if (!lst.isFile()) return { error: `${r.rel}: bukan file biasa` };
    if (lst.size > workspace.MAX_WRITE_BYTES) return { error: `${r.rel}: file terlalu besar untuk patch` };
    try { before = fs.readFileSync(r.abs); } catch (err) { return { error: `${r.rel}: gagal dibaca (${err.message})` }; }
  }
  const e = {
    rel: r.rel,
    abs: r.abs,
    key,
    existedBefore: before !== null,
    before,
    beforeHash: before ? sha256(before) : null,
    mode: lst ? lst.mode & 0o777 : 0o644,
    exists: before !== null,
    buf: before,
  };
  st.entries.set(key, e);
  return { e };
}

/** Isi file sebagai teks UTF-8 murni, atau {error}. */
function textOf(e) {
  if (workspace.looksBinary(e.buf)) return { error: `${e.rel}: file biner, bukan teks` };
  const s = e.buf.toString('utf8');
  // Byte non-UTF-8 (mis. Latin-1) akan rusak permanen bila ditulis ulang: tolak.
  if (!Buffer.from(s, 'utf8').equals(e.buf)) {
    return { error: `${e.rel}: bukan UTF-8 murni (mungkin Latin-1/ANSI), tidak aman diubah` };
  }
  return { text: s };
}

function validNewText(rel, s) {
  if (s.includes('\0')) return `${rel}: isi mengandung karakter NUL (biner)`;
  if (typeof s.isWellFormed === 'function' && !s.isWellFormed()) return `${rel}: isi bukan UTF-8 yang valid (surrogate yatim)`;
  if (s.includes('\uFFFD')) return `${rel}: isi mengandung karakter pengganti U+FFFD (teks rusak)`;
  return null;
}

function doEdit(st, o) {
  const t = touch(st, o.path);
  if (t.error) return t.error;
  const e = t.e;
  if (!e.exists) return `${e.rel}: file belum ada (pakai op "create" untuk file baru)`;
  if (o.oldText.length > LIMITS.MAX_OLD_CHARS || o.newText.length > LIMITS.MAX_NEW_CHARS) {
    return `${e.rel}: teks terlalu panjang, pecah menjadi beberapa edit kecil`;
  }
  const cur = textOf(e);
  if (cur.error) return cur.error;
  const content = cur.text;
  const bad = validNewText(e.rel, o.newText);
  if (bad) return bad;

  const eol = eolOf(content);
  const oldFit = fitEol(o.oldText, eol);
  let oldUse = oldFit;
  let newUse = fitEol(o.newText, eol);
  let count = countOccurrences(content, oldUse);
  if (count === 0 && o.oldText !== oldFit) {
    count = countOccurrences(content, o.oldText);
    if (count > 0) { oldUse = o.oldText; newUse = o.newText; }
  }
  if (oldUse === newUse) return `${e.rel}: tidak ada perubahan (teks lama sama dengan teks baru)`;
  if (count === 0) {
    return `${e.rel}: oldText tidak ditemukan (spasi/indentasi harus persis). Baca ulang file lalu coba lagi`;
  }
  if (count > 1 && !o.replaceAll) {
    return `${e.rel}: oldText ditemukan ${count} kali. Tambahkan konteks agar unik, atau set replaceAll=true`;
  }
  const updated = o.replaceAll
    ? content.split(oldUse).join(newUse)
    : content.slice(0, content.indexOf(oldUse)) + newUse + content.slice(content.indexOf(oldUse) + oldUse.length);
  if (Buffer.byteLength(updated, 'utf8') > workspace.MAX_WRITE_BYTES) return `${e.rel}: hasil edit terlalu besar`;
  e.buf = Buffer.from(updated, 'utf8');
  st.norm.push({ op: 'edit', path: e.rel, oldText: o.oldText, newText: o.newText, replaceAll: o.replaceAll });
  const n = o.replaceAll ? count : 1;
  st.linesRemoved += countLines(o.oldText) * n;
  st.linesAdded += countLines(o.newText) * n;
  return null;
}

function doCreate(st, o) {
  const t = touch(st, o.path);
  if (t.error) return t.error;
  const e = t.e;
  if (e.exists) return `${e.rel}: file sudah ada (pakai op "edit" untuk mengubahnya)`;
  if (Buffer.byteLength(o.content, 'utf8') > workspace.MAX_WRITE_BYTES) {
    return `${e.rel}: isi terlalu besar (maks ${workspace.MAX_WRITE_BYTES / 1024} KB)`;
  }
  const bad = validNewText(e.rel, o.content);
  if (bad) return bad;
  e.exists = true;
  e.buf = Buffer.from(o.content, 'utf8');
  st.norm.push({ op: 'create', path: e.rel, content: o.content });
  st.linesAdded += countLines(o.content);
  return null;
}

function doDelete(st, o) {
  const t = touch(st, o.path);
  if (t.error) return t.error;
  const e = t.e;
  if (!e.exists) return `${e.rel}: file tidak ada, tidak bisa dihapus`;
  const cur = textOf(e);
  if (cur.error) return `${cur.error} (hapus file biner/non-UTF-8 secara manual)`;
  st.linesRemoved += countLines(cur.text);
  st.norm.push({ op: 'delete', path: e.rel });
  st.reasons.push(`hapus ${e.rel}`);
  e.exists = false;
  e.buf = null;
  return null;
}

function doRename(st, o) {
  const a = touch(st, o.from);
  if (a.error) return a.error;
  const b = touch(st, o.to);
  if (b.error) return b.error;
  if (a.e.key === b.e.key) return `${a.e.rel}: path asal dan tujuan sama`;
  if (!a.e.exists) return `${a.e.rel}: file asal tidak ada`;
  if (b.e.exists) return `${b.e.rel}: tujuan rename sudah ada`;
  st.norm.push({ op: 'rename', from: a.e.rel, to: b.e.rel });
  st.reasons.push(`rename ${a.e.rel} -> ${b.e.rel}`);
  b.e.exists = true;
  b.e.buf = a.e.buf;
  b.e.mode = a.e.mode;
  a.e.exists = false;
  a.e.buf = null;
  return null;
}

/**
 * @param {Array|string} input operasi (array) atau string JSON-nya
 * @returns {{ok:true, plan:object}|{ok:false, error:string}}
 */
function planPatch(input) {
  if (!workspace.hasRoot()) return { ok: false, error: workspace.NO_ROOT };
  const parsed = parseOperations(input);
  if (parsed.error) return { ok: false, error: parsed.error };

  const st = { entries: new Map(), norm: [], reasons: [], linesAdded: 0, linesRemoved: 0 };
  const handlers = { edit: doEdit, create: doCreate, delete: doDelete, rename: doRename };

  for (let i = 0; i < parsed.ops.length; i++) {
    const o = parsed.ops[i];
    const err = handlers[o.op](st, o);
    if (err) return { ok: false, error: `Operasi #${i + 1} (${o.op}): ${err}` };
    if (st.linesAdded + st.linesRemoved > LIMITS.MAX_LINES) {
      return {
        ok: false,
        error: `Patch melewati batas ${LIMITS.MAX_LINES} baris (tambah+hapus, satu baris diganti dihitung 2). ` +
          'Pecah menjadi beberapa patch yang lebih kecil.',
      };
    }
  }
  const normOps = st.norm;
  const reasons = st.reasons;
  const writes = [];
  let totalBytes = 0;
  for (const e of st.entries.values()) {
    const changed = e.exists !== e.existedBefore || (e.exists && !e.buf.equals(e.before));
    if (!changed) continue;
    if (e.exists) totalBytes += e.buf.length;
    writes.push({
      rel: e.rel,
      abs: e.abs,
      action: !e.exists ? 'delete' : e.existedBefore ? 'modify' : 'create',
      mode: e.mode,
      before: { exists: e.existedBefore, hash: e.beforeHash, buf: e.before },
      after: { exists: e.exists, hash: e.exists ? sha256(e.buf) : null, buf: e.buf },
    });
  }
  if (!writes.length) return { ok: false, error: 'Patch tidak mengubah apa pun' };
  if (totalBytes > LIMITS.MAX_TOTAL_BYTES) {
    return { ok: false, error: `Total isi file hasil patch terlalu besar (maks ${LIMITS.MAX_TOTAL_BYTES / 1024} KB)` };
  }
  writes.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  for (const e of st.entries.values()) {
    const base = path.posix.basename(e.rel).toLowerCase();
    if (DEPENDENCY_FILES.has(base)) reasons.push(`menyentuh ${e.rel}`);
  }
  const kind = reasons.length ? 'destructive' : 'additive';
  const touched = [];
  for (const o of normOps) {
    if (o.op === 'rename') {
      touched.push({ path: o.from, op: 'rename-from' }, { path: o.to, op: 'rename-to' });
    } else {
      touched.push({ path: o.path, op: o.op });
    }
  }
  const prereq = [...st.entries.values()]
    .map((e) => ({ path: e.rel, hash: e.beforeHash }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const digest = sha256(Buffer.from(canonical({ v: 1, ops: normOps, prereq }), 'utf8'));
  const stats = {
    operations: normOps.length,
    files: st.entries.size,
    linesAdded: st.linesAdded,
    linesRemoved: st.linesRemoved,
    lines: st.linesAdded + st.linesRemoved,
    bytes: totalBytes,
  };
  return {
    ok: true,
    plan: {
      root: workspace.getRoot(),
      digest,
      kind,
      reasons,
      stats,
      touched,
      ops: normOps,
      writes,
    },
  };
}

/** Ringkasan satu kalimat (Indonesia) untuk diucapkan. */
function describePlan(plan) {
  const s = plan.stats;
  const c = { create: 0, modify: 0, delete: 0 };
  for (const w of plan.writes) c[w.action] += 1;
  const parts = [];
  if (c.modify) parts.push(`${c.modify} diubah`);
  if (c.create) parts.push(`${c.create} baru`);
  if (c.delete) parts.push(`${c.delete} dihapus`);
  const jenis = plan.kind === 'destructive' ? 'bersifat merusak (hapus/ganti nama/berkas dependensi)' : 'hanya menambah/mengubah';
  return `${plan.writes.length} file (${parts.join(', ')}), ${s.linesAdded} baris ditambah dan ${s.linesRemoved} dihapus, ${jenis}`;
}

module.exports = {
  planPatch, parseOperations, describePlan, countLines, sha256, canonical, pathKey, LIMITS, DEPENDENCY_FILES,
  __test: { eolOf, fitEol, pathKey },
};
