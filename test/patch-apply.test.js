require('./helpers/stub-modules');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ws = require('../src/workspace/workspace');
const { planPatch } = require('../src/patch/patch-plan');
const { applyOperations, __test: hook } = require('../src/patch/patch-apply');
const tools = require('../src/tools');
const applyTool = tools.getTool('apply_patch');
const edit = (p, oldText, newText) => ({ op: 'edit', path: p, oldText, newText });
const create = (p, content) => ({ op: 'create', path: p, content });

function project(files = {}) {
  hook.reset();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'via-pa-'));
  ws.setBackupDir(fs.mkdtempSync(path.join(os.tmpdir(), 'via-pa-bak-')));
  const root = ws.setRoot(dir).root;
  for (const [n, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, n)), { recursive: true });
    fs.writeFileSync(path.join(root, n), c);
  }
  return root;
}
const digestOf = (ops) => planPatch(ops).plan.digest;
const read = (root, n) => fs.readFileSync(path.join(root, n), 'utf8');
const leftovers = (root) => {
  const out = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.startsWith('.via-tmp-')) out.push(p); } })(root);
  return out;
};
function failNth(name, n, extra) {
  let calls = 0;
  const orig = fs[name];
  hook.setFs({
    [name]: (...a) => {
      calls += 1;
      if (calls === n) { if (extra) extra(a); throw new Error(`gagal buatan ${name}#${n}`); }
      return orig(...a);
    },
  });
}

test('berhasil: edit + create (folder baru) + rename + delete; tanpa sisa temp; cadangan di luar proyek', () => {
  const root = project({ 'a.txt': 'x\n', 'old.txt': 'lama\n', 'gone.txt': 'hapus\n' });
  const ops = [edit('a.txt', 'x', 'y'), create('dir/sub/n.txt', 'baru\n'), { op: 'rename', from: 'old.txt', to: 'new.txt' }, { op: 'delete', path: 'gone.txt' }];
  const r = applyOperations(ops, { approvedDigest: digestOf(ops) });
  assert.ok(r.success, r.error);
  assert.equal(r.kind, 'destructive');
  assert.equal(read(root, 'a.txt'), 'y\n');
  assert.equal(read(root, 'dir/sub/n.txt'), 'baru\n');
  assert.equal(read(root, 'new.txt'), 'lama\n');
  assert.ok(!fs.existsSync(path.join(root, 'old.txt')));
  assert.ok(!fs.existsSync(path.join(root, 'gone.txt')));
  assert.deepEqual(leftovers(root), []);
  assert.ok(r.backupsSaved >= 3);
});

test('tanpa digest / digest salah / isi disk berubah sejak disetujui: ditolak, tidak ada yang ditulis', () => {
  const root = project({ 'a.txt': 'x\n' });
  const ops = [edit('a.txt', 'x', 'y')];
  assert.equal(applyOperations(ops, {}).code, 'NO_DIGEST');
  assert.equal(applyOperations(ops, { approvedDigest: 'abc' }).code, 'DIGEST_MISMATCH');
  const d = digestOf(ops);
  fs.writeFileSync(path.join(root, 'a.txt'), 'x\n# diubah orang lain\n');
  assert.equal(applyOperations(ops, { approvedDigest: d }).code, 'DIGEST_MISMATCH');
  assert.equal(read(root, 'a.txt'), 'x\n# diubah orang lain\n');
});

test('gagal di tahap temp: tidak ada file proyek berubah, temp dan folder baru dibersihkan', () => {
  const root = project({ 'a.txt': 'x\n' });
  const ops = [edit('a.txt', 'x', 'y'), create('baru/dalam/b.txt', 'b\n')];
  const d = digestOf(ops);
  failNth('openSync', 2);
  const r = applyOperations(ops, { approvedDigest: d });
  assert.equal(r.success, false);
  assert.equal(r.code, 'STAGE_FAILED');
  assert.equal(read(root, 'a.txt'), 'x\n');
  assert.ok(!fs.existsSync(path.join(root, 'baru')));
  assert.deepEqual(leftovers(root), []);
});

test('gagal di tengah komit: rollback otomatis mengembalikan semuanya', () => {
  const root = project({ 'a.txt': 'x\n', 'b.txt': 'y\n' });
  const ops = [edit('a.txt', 'x', 'X'), edit('b.txt', 'y', 'Y'), create('baru/c.txt', 'c\n')];
  const d = digestOf(ops);
  failNth('renameSync', 3);       // a.txt dan b.txt sudah tertulis, c.txt gagal
  const r = applyOperations(ops, { approvedDigest: d });
  hook.reset();
  assert.equal(r.success, false);
  assert.equal(r.code, 'COMMIT_FAILED');
  assert.equal(r.rollback.ok, true);
  assert.match(r.error, /dikembalikan/);
  assert.equal(read(root, 'a.txt'), 'x\n');
  assert.equal(read(root, 'b.txt'), 'y\n');
  assert.ok(!fs.existsSync(path.join(root, 'baru')), 'folder yang dibuat patch ikut dihapus');
  assert.deepEqual(leftovers(root), []);
});

test('gagal saat menghapus: file yang sudah dibuat/diganti dikembalikan, file yang dihapus dipulihkan', () => {
  const root = project({ 'a.txt': 'x\n', 'gone.txt': 'hapus\n' });
  const ops = [edit('a.txt', 'x', 'X'), { op: 'delete', path: 'gone.txt' }, { op: 'rename', from: 'a.txt', to: 'z.txt' }];
  const d = digestOf(ops);
  failNth('unlinkSync', 1);
  const r = applyOperations(ops, { approvedDigest: d });
  hook.reset();
  assert.equal(r.success, false);
  assert.equal(r.rollback.ok, true);
  assert.equal(read(root, 'a.txt'), 'x\n');
  assert.equal(read(root, 'gone.txt'), 'hapus\n');
  assert.ok(!fs.existsSync(path.join(root, 'z.txt')));
});

test('NEWER_BATCH: dilaporkan sebagai KEGAGALAN rollback dan file itu tidak ditimpa', () => {
  const root = project({ 'a.txt': 'x\n', 'b.txt': 'y\n' });
  const ops = [edit('a.txt', 'x', 'X'), edit('b.txt', 'y', 'Y')];
  const d = digestOf(ops);
  const absA = path.join(fs.realpathSync(root), 'a.txt');
  failNth('renameSync', 2, () => hook.markBatch(absA, 999));   // batch lebih baru "menulis" a.txt
  const r = applyOperations(ops, { approvedDigest: d });
  hook.reset();
  assert.equal(r.success, false);
  assert.equal(r.rollbackFailed, true);
  assert.equal(r.rollback.ok, false);
  assert.deepEqual(r.rollback.failures.map((f) => f.code), ['NEWER_BATCH']);
  assert.match(r.error, /ROLLBACK GAGAL/);
  assert.match(r.error, /a\.txt \[NEWER_BATCH\]/);
  assert.equal(read(root, 'a.txt'), 'X\n', 'tidak ditimpa karena ada batch yang lebih baru');
  assert.equal(read(root, 'b.txt'), 'y\n');
});

test('isi berubah setelah ditulis (pihak lain): rollback gagal CHANGED_SINCE_WRITE, bukan menimpa', () => {
  const root = project({ 'a.txt': 'x\n', 'b.txt': 'y\n' });
  const ops = [edit('a.txt', 'x', 'X'), edit('b.txt', 'y', 'Y')];
  const d = digestOf(ops);
  failNth('renameSync', 2, () => fs.writeFileSync(path.join(root, 'a.txt'), 'orang lain\n'));
  const r = applyOperations(ops, { approvedDigest: d });
  hook.reset();
  assert.equal(r.rollbackFailed, true);
  assert.deepEqual(r.rollback.failures.map((f) => f.code), ['CHANGED_SINCE_WRITE']);
  assert.equal(read(root, 'a.txt'), 'orang lain\n');
});

test('verifikasi gagal (isi hasil tulis tidak cocok): rollback ke isi semula', () => {
  const root = project({ 'a.txt': 'x\n' });
  const ops = [edit('a.txt', 'x', 'X')];
  const d = digestOf(ops);
  const target = path.join(fs.realpathSync(root), 'a.txt');
  let corrupt = false;
  const origRename = fs.renameSync;
  const origRead = fs.readFileSync;
  hook.setFs({
    renameSync: (a, b) => { origRename(a, b); if (b === target && !corrupt) corrupt = 'armed'; },
    readFileSync: (p, ...rest) => (corrupt === 'armed' && p === target && !rest.length ? Buffer.from('rusak') : origRead(p, ...rest)),
  });
  const r = applyOperations(ops, { approvedDigest: d });
  hook.reset();
  assert.equal(r.code, 'VERIFY_FAILED');
  assert.equal(r.rollback.ok, true);
  assert.equal(read(root, 'a.txt'), 'x\n');
});

test('tool apply_patch: alwaysConfirm, digestOf, validate, describe (aditif vs merusak), execute wajib digest', async () => {
  const root = project({ 'a.txt': 'x\n', 'package.json': '{}\n' });
  assert.equal(applyTool.alwaysConfirm, true);
  process.env.VIA_AUTO_TOOLS = 'apply_patch';
  try { assert.equal(tools.permissionOf(applyTool), 'confirm'); } finally { delete process.env.VIA_AUTO_TOOLS; }

  const ops = JSON.stringify([edit('a.txt', 'x', 'y')]);
  const args = tools.normalizeArgs(applyTool, { operations: ops, alasan: 'tes' }).args;
  assert.equal(await tools.validateCall(applyTool, args), null);
  assert.match(tools.describeCall(applyTool, args), /Boleh aku menerapkan patch: 1 file \(1 diubah\)/);
  assert.ok(!/PERHATIAN/.test(tools.describeCall(applyTool, args)));

  const bad = tools.normalizeArgs(applyTool, { operations: JSON.stringify([edit('a.txt', 'tidak ada', 'q')]) }).args;
  assert.match(await tools.validateCall(applyTool, bad), /tidak ditemukan/);

  const risky = tools.normalizeArgs(applyTool, { operations: JSON.stringify([{ op: 'delete', path: 'a.txt' }]) }).args;
  assert.match(tools.describeCall(applyTool, risky), /PERHATIAN/);

  const noDigest = await tools.executeTool('apply_patch', args, {});
  assert.equal(noDigest.success, false);
  assert.equal(noDigest.code, 'NO_DIGEST');
  assert.equal(read(root, 'a.txt'), 'x\n');

  const done = await tools.executeTool('apply_patch', args, { approvedDigest: tools.digestOf(applyTool, args) });
  assert.ok(done.success, done.error);
  assert.equal(read(root, 'a.txt'), 'y\n');
});
