'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const workspace = require('../workspace/workspace');
const { planPatch, sha256 } = require('./patch-plan');
const IS_WIN = process.platform === 'win32';
let fsx = fs;                      
let batchSeq = 0;
const lastBatchByPath = new Map(); 

function readCurrent(abs) {
  let lst;
  try {
    lst = fsx.lstatSync(abs);
  } catch (err) {
    if (err.code === 'ENOENT') return { exists: false };
    throw err;
  }
  if (lst.isSymbolicLink() || !lst.isFile()) return { exists: true, weird: true };
  return { exists: true, buf: fsx.readFileSync(abs) };
}

function mkdirTracked(dir, created) {
  const missing = [];
  let d = dir;
  while (!fsx.existsSync(d)) {
    missing.push(d);
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  for (const m of missing.reverse()) {
    fsx.mkdirSync(m);
    created.push(m);
  }
}

function writeTemp(abs, buf, mode) {
  const tmp = path.join(path.dirname(abs), `.via-tmp-${crypto.randomBytes(4).toString('hex')}`);
  const fd = fsx.openSync(tmp, 'wx', mode || 0o644);
  try {
    fsx.writeSync(fd, buf, 0, buf.length);
    try { fsx.fsyncSync(fd); } catch { /* tidak semua FS mendukung */ }
  } catch (err) {
    try { fsx.closeSync(fd); } catch { /* abaikan */ }
    try { fsx.unlinkSync(tmp); } catch { /* abaikan */ }
    throw err;
  }
  fsx.closeSync(fd);
  if (!IS_WIN && mode) { try { fsx.chmodSync(tmp, mode); } catch { /* best effort */ } }
  return tmp;
}

function unlinkQuiet(p) {
  try { fsx.unlinkSync(p); } catch { /* abaikan */ }
}

function restoreFile(w) {
  const created = [];
  mkdirTracked(path.dirname(w.abs), created);
  const tmp = writeTemp(w.abs, w.before.buf, w.mode);
  try {
    fsx.renameSync(tmp, w.abs);
  } catch (err) {
    unlinkQuiet(tmp);
    throw err;
  }
}

/**
 * Batalkan langkah jurnal secara terbalik. Mengembalikan {ok, restored[], failures[]}.
 * @param {{verifyContent:boolean}} opts false setelah verifikasi gagal (isi memang tak cocok)
 */
function rollback(journal, createdDirs, batchId, { verifyContent }) {
  const restored = [];
  const failures = [];
  for (const j of journal.slice().reverse()) {
    const w = j.w;
    try {
      const newer = lastBatchByPath.get(w.abs);
      if (newer !== undefined && newer > batchId) {
        failures.push({ path: w.rel, code: 'NEWER_BATCH', message: `${w.rel}: sudah ditulis batch yang lebih baru (#${newer}); tidak dikembalikan` });
        continue;
      }
      const cur = readCurrent(w.abs);
      if (j.kind === 'put') {
        if (verifyContent && (!cur.exists || cur.weird || sha256(cur.buf) !== w.after.hash)) {
          failures.push({ path: w.rel, code: 'CHANGED_SINCE_WRITE', message: `${w.rel}: isinya berubah setelah ditulis; tidak dikembalikan` });
          continue;
        }
        if (cur.weird) {
          failures.push({ path: w.rel, code: 'CHANGED_SINCE_WRITE', message: `${w.rel}: bukan file biasa lagi; tidak dikembalikan` });
          continue;
        }
        if (w.before.exists) restoreFile(w);
        else if (cur.exists) fsx.unlinkSync(w.abs);
      } else {
        if (cur.exists) {
          failures.push({ path: w.rel, code: 'CHANGED_SINCE_WRITE', message: `${w.rel}: muncul lagi setelah dihapus; tidak dikembalikan` });
          continue;
        }
        restoreFile(w);
      }
      lastBatchByPath.delete(w.abs);
      restored.push(w.rel);
    } catch (err) {
      failures.push({ path: w.rel, code: 'ROLLBACK_ERROR', message: `${w.rel}: ${err.message}` });
    }
  }
  for (const d of createdDirs.slice().reverse()) {
    try { fsx.rmdirSync(d); } catch { /* tidak kosong / sudah ada: biarkan */ }
  }
  return { attempted: true, ok: failures.length === 0, restored, failures };
}

function failure(error, code, extra = {}) {
  return { success: false, error, code, ...extra };
}

function withRollback(base, rb) {
  if (rb.ok) return { ...base, rollback: rb, error: `${base.error}. Semua perubahan sudah dikembalikan.` };
  const names = rb.failures.map((f) => `${f.path} [${f.code}]`).join(', ');
  return {
    ...base,
    rollbackFailed: true,
    rollback: rb,
    error: `${base.error}. ROLLBACK GAGAL untuk: ${names}. Folder proyek mungkin dalam keadaan setengah berubah; periksa dengan git.`,
  };
}

/**
 * @param {Array|string} operations
 * @param {{approvedDigest?: string}} opts digest rencana yang disetujui pengguna
 */
function applyOperations(operations, { approvedDigest } = {}) {
  const planned = planPatch(operations);
  if (!planned.ok) return failure(planned.error, 'INVALID');
  const plan = planned.plan;
  if (!approvedDigest) return failure('Persetujuan tidak terikat digest; patch tidak diterapkan', 'NO_DIGEST');
  if (plan.digest !== approvedDigest) {
    return failure('Isi file atau operasi berubah sejak disetujui (digest tidak cocok); patch tidak diterapkan', 'DIGEST_MISMATCH');
  }
  if (plan.root !== workspace.getRoot()) return failure('Folder proyek berganti; patch tidak diterapkan', 'ROOT_CHANGED');
  for (const w of plan.writes) {
    let cur;
    try { cur = readCurrent(w.abs); } catch (err) { return failure(`${w.rel}: ${err.message}`, 'STALE'); }
    const nowHash = cur.exists && !cur.weird ? sha256(cur.buf) : null;
    if (cur.weird || cur.exists !== w.before.exists || nowHash !== w.before.hash) {
      return failure(`${w.rel}: berubah sejak direncanakan; patch tidak diterapkan`, 'STALE');
    }
  }
  let backups = 0;
  try {
    for (const w of plan.writes) {
      if (w.before.exists && workspace.backupBeforeWrite(w.abs, w.rel)) backups += 1;
    }
  } catch (err) {
    return failure(`Gagal membuat cadangan: ${err.message}; patch tidak diterapkan`, 'BACKUP_FAILED');
  }

  const batchId = ++batchSeq;
  const createdDirs = [];
  const staged = [];       
  const journal = [];      
  const cleanupTemps = () => { for (const s of staged) unlinkQuiet(s.tmp); };

  try {
    for (const w of plan.writes) {
      if (!w.after.exists) continue;
      mkdirTracked(path.dirname(w.abs), createdDirs);
      staged.push({ w, tmp: writeTemp(w.abs, w.after.buf, w.mode) });
    }
  } catch (err) {
    cleanupTemps();
    for (const d of createdDirs.slice().reverse()) { try { fsx.rmdirSync(d); } catch { /* biarkan */ } }
    return failure(`Gagal menyiapkan file sementara: ${err.message}. Tidak ada file proyek yang berubah`, 'STAGE_FAILED');
  }

  let step = '';
  try {
    for (const s of staged) {
      step = s.w.rel;
      fsx.renameSync(s.tmp, s.w.abs);
      s.done = true;
      journal.push({ w: s.w, kind: 'put' });
      lastBatchByPath.set(s.w.abs, batchId);
    }
    for (const w of plan.writes) {
      if (w.after.exists) continue;
      step = w.rel;
      fsx.unlinkSync(w.abs);
      journal.push({ w, kind: 'del' });
      lastBatchByPath.set(w.abs, batchId);
    }
  } catch (err) {
    for (const s of staged) if (!s.done) unlinkQuiet(s.tmp);
    const rb = rollback(journal, createdDirs, batchId, { verifyContent: true });
    return withRollback(failure(`Gagal menulis ${step}: ${err.message}`, 'COMMIT_FAILED'), rb);
  }
  try {
    for (const w of plan.writes) {
      const cur = readCurrent(w.abs);
      if (w.after.exists) {
        if (!cur.exists || cur.weird || sha256(cur.buf) !== w.after.hash) throw new Error(`${w.rel}: isi hasil tulis tidak cocok`);
      } else if (cur.exists) {
        throw new Error(`${w.rel}: masih ada setelah dihapus`);
      }
    }
  } catch (err) {
    const rb = rollback(journal, createdDirs, batchId, { verifyContent: false });
    return withRollback(failure(`Verifikasi gagal: ${err.message}`, 'VERIFY_FAILED'), rb);
  }
  console.log(`[patch] batch #${batchId} diterapkan: ${plan.writes.map((w) => `${w.action}:${w.rel}`).join(', ')}`);
  return {
    success: true,
    batchId,
    digest: plan.digest,
    kind: plan.kind,
    files: plan.writes.map((w) => ({ path: w.rel, action: w.action })),
    stats: plan.stats,
    backupsSaved: backups,
    message: `Patch diterapkan: ${plan.writes.length} file, ${plan.stats.linesAdded} baris ditambah, ${plan.stats.linesRemoved} dihapus`,
  };
}

module.exports = {
  applyOperations,
  __test: {
    setFs(overrides) { fsx = Object.assign(Object.create(fs), overrides); },
    reset() { fsx = fs; batchSeq = 0; lastBatchByPath.clear(); },
    markBatch(abs, id) { lastBatchByPath.set(abs, id); },
    currentBatch() { return batchSeq; },
  },
};
