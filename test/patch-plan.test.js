require('./helpers/stub-modules');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ws = require('../src/workspace/workspace');
const { planPatch, describePlan, countLines, LIMITS } = require('../src/patch/patch-plan');

function project(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'via-pp-'));
  const root = ws.setRoot(dir).root;
  for (const [n, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, n)), { recursive: true });
    fs.writeFileSync(path.join(root, n), c);
  }
  return root;
}
const edit = (p, oldText, newText, extra = {}) => ({ op: 'edit', path: p, oldText, newText, ...extra });
const create = (p, content) => ({ op: 'create', path: p, content });

test('countLines: kosong 0, newline akhir tidak dihitung baris tambahan', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('a'), 1);
  assert.equal(countLines('a\n'), 1);
  assert.equal(countLines('a\nb'), 2);
  assert.equal(countLines('a\nb\n'), 2);
});

test('edit + create dasar: aditif, statistik baris, tidak menulis ke disk', () => {
  const root = project({ 'a.js': 'const x = 1;\n' });
  const r = planPatch([edit('a.js', 'x = 1', 'x = 2'), create('src/b.js', 'a\nb\n')]);
  assert.ok(r.ok, r.error);
  assert.equal(r.plan.kind, 'additive');
  assert.deepEqual([r.plan.stats.linesAdded, r.plan.stats.linesRemoved, r.plan.stats.lines], [3, 1, 4]);
  assert.equal(r.plan.stats.files, 2);
  assert.equal(r.plan.writes.length, 2);
  assert.equal(fs.readFileSync(path.join(root, 'a.js'), 'utf8'), 'const x = 1;\n');
  assert.ok(!fs.existsSync(path.join(root, 'src/b.js')));
  assert.match(describePlan(r.plan), /1 diubah, 1 baru/);
});

test('string JSON diterima; JSON rusak / bukan array / op tak dikenal ditolak', () => {
  project({ 'a.txt': 'x\n' });
  assert.ok(planPatch(JSON.stringify([edit('a.txt', 'x', 'y')])).ok);
  assert.match(planPatch('{bukan json').error, /JSON/);
  assert.match(planPatch('42').error, /array/);
  assert.match(planPatch([]).error, /kosong/);
  assert.match(planPatch([{ op: 'sihir', path: 'a.txt' }]).error, /"op"/);
  assert.match(planPatch([{ op: 'edit', path: 'a.txt', oldText: '', newText: 'y' }]).error, /oldText/);
  assert.match(planPatch([{ op: 'rename', from: 'a.txt' }]).error, /from.*to/);
});

test('edit berurutan pada file yang sama saling menyambung (overlay)', () => {
  project({ 'a.txt': 'satu\ndua\n' });
  const r = planPatch([edit('a.txt', 'satu', 'SATU'), edit('a.txt', 'SATU\ndua', 'SATU\nDUA')]);
  assert.ok(r.ok, r.error);
  assert.equal(r.plan.writes.length, 1);
  assert.equal(r.plan.writes[0].after.buf.toString('utf8'), 'SATU\nDUA\n');
  assert.equal(r.plan.stats.files, 1, 'path unik dihitung sekali');
});

test('edit: tidak cocok / ganda / sama ditolak; replaceAll menghitung semua tempat', () => {
  project({ 'b.txt': 'foo\nbar\nfoo\n' });
  assert.match(planPatch([edit('b.txt', 'baz', 'q')]).error, /tidak ditemukan/);
  assert.match(planPatch([edit('b.txt', 'foo', 'q')]).error, /2 kali/);
  assert.match(planPatch([edit('b.txt', 'foo', 'foo')]).error, /tidak ada perubahan/);
  const r = planPatch([edit('b.txt', 'foo', 'q', { replaceAll: true })]);
  assert.ok(r.ok);
  assert.equal(r.plan.stats.lines, 4, '2 tempat x (1 hapus + 1 tambah)');
});

test('satu baris diganti dihitung 2; batas 500 baris tepat di 500', () => {
  const lines = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`).join('\n') + '\n';
  project({ 'big.txt': lines(300, 'L') });
  const ok = planPatch([edit('big.txt', lines(250, 'L'), lines(250, 'N'))]);
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.plan.stats.lines, 500);
  const over = planPatch([edit('big.txt', lines(251, 'L'), lines(251, 'N'))]);
  assert.equal(over.ok, false);
  assert.match(over.error, /500 baris/);
  assert.equal(planPatch([edit('big.txt', 'L0\n', 'M0\n')]).plan.stats.lines, 2);
});

test('batas 10 file (path unik) dan rename dihitung dua', () => {
  project({ 'r.txt': 'x\n' });
  const ten = Array.from({ length: 10 }, (_, i) => create(`f${i}.txt`, 'a\n'));
  assert.ok(planPatch(ten).ok);
  assert.match(planPatch([...ten, create('f10.txt', 'a\n')]).error, /lebih dari 10 file/);
  const nine = ten.slice(0, 9);
  assert.match(planPatch([...nine, { op: 'rename', from: 'r.txt', to: 'r2.txt' }]).error, /lebih dari 10 file/);
  assert.ok(planPatch([...ten.slice(0, 8), { op: 'rename', from: 'r.txt', to: 'r2.txt' }]).ok);
});

test('batas 100 operasi', () => {
  project({ 'a.txt': 'x\n' });
  const many = Array.from({ length: LIMITS.MAX_OPERATIONS + 1 }, () => edit('a.txt', 'x', 'x2'));
  assert.match(planPatch(many).error, /Terlalu banyak operasi/);
  const hundred = [edit('a.txt', 'x', 'y')];
  for (let i = 0; i < 99; i++) hundred.push(edit('a.txt', i === 0 ? 'y' : 'y' + (i - 1), 'y' + i));
  const r = planPatch(hundred);
  assert.ok(r.ok, r.error);
  assert.equal(r.plan.stats.operations, 100);
});

test('klasifikasi: delete/rename/berkas dependensi = destruktif; campuran = destruktif seluruhnya', () => {
  project({ 'a.txt': 'x\n', 'sub/package.json': '{}\n', 'package-lock.json': '{}\n', 'yarn.lock': '\n', 'pnpm-lock.yaml': '\n' });
  assert.equal(planPatch([edit('a.txt', 'x', 'y')]).plan.kind, 'additive');
  assert.equal(planPatch([create('baru.txt', 'x\n')]).plan.kind, 'additive');
  assert.equal(planPatch([{ op: 'delete', path: 'a.txt' }]).plan.kind, 'destructive');
  assert.equal(planPatch([{ op: 'rename', from: 'a.txt', to: 'z.txt' }]).plan.kind, 'destructive');
  const dep = {
    'sub/package.json': ['{}', '{"a":1}'], 'package-lock.json': ['{}', '{"a":1}'],
    'yarn.lock': ['\n', '# x\n'], 'pnpm-lock.yaml': ['\n', '# x\n'],
  };
  for (const [f, [a, b]] of Object.entries(dep)) {
    assert.equal(planPatch([edit(f, a, b)]).plan.kind, 'destructive', f);
  }
  assert.equal(planPatch([create('package.json', '{}\n')]).plan.kind, 'destructive');
  const mixed = planPatch([create('n.txt', 'x\n'), { op: 'delete', path: 'a.txt' }]);
  assert.equal(mixed.plan.kind, 'destructive');
  assert.ok(mixed.plan.reasons.length >= 1);
});

test('digest: stabil untuk masukan sama; berubah bila operasi atau isi disk berubah', () => {
  const root = project({ 'a.txt': 'x\n' });
  const d1 = planPatch([edit('a.txt', 'x', 'y')]).plan.digest;
  assert.equal(planPatch([edit('a.txt', 'x', 'y')]).plan.digest, d1);
  assert.notEqual(planPatch([edit('a.txt', 'x', 'z')]).plan.digest, d1);
  fs.writeFileSync(path.join(root, 'a.txt'), 'x\n# berubah\n');
  assert.notEqual(planPatch([edit('a.txt', 'x', 'y')]).plan.digest, d1, 'hash prasyarat ikut digest');
  assert.match(d1, /^[0-9a-f]{64}$/);
});

test('CRLF dipertahankan; model menulis LF tetap cocok', () => {
  project({ 'win.txt': 'baris1\r\nbaris2\r\nbaris3\r\n' });
  const r = planPatch([edit('win.txt', 'baris1\nbaris2', 'A\nB\nC')]);
  assert.ok(r.ok, r.error);
  assert.equal(r.plan.writes[0].after.buf.toString('utf8'), 'A\r\nB\r\nC\r\nbaris3\r\n');
});

test('biner dan non-UTF-8 ditolak untuk edit/delete; NUL dan U+FFFD ditolak di isi baru', () => {
  const root = project({ 'ok.txt': 'x\n' });
  fs.writeFileSync(path.join(root, 'bin.dat'), Buffer.from([1, 2, 0, 3]));
  fs.writeFileSync(path.join(root, 'latin.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
  assert.match(planPatch([edit('bin.dat', 'a', 'b')]).error, /biner/);
  assert.match(planPatch([{ op: 'delete', path: 'bin.dat' }]).error, /biner/);
  assert.match(planPatch([edit('latin.txt', 'caf', 'kafe')]).error, /UTF-8/);
  assert.match(planPatch([create('n.txt', 'a\0b')]).error, /NUL/);
  assert.match(planPatch([create('n.txt', 'a\uFFFDb')]).error, /U\+FFFD/);
  assert.match(planPatch([create('n.txt', 'a\ud800b')]).error, /UTF-8/);
  assert.ok(planPatch([{ op: 'rename', from: 'bin.dat', to: 'bin2.dat' }]).ok);
});

test('path: rahasia, folder terlindungi, keluar proyek, absolut, symlink ditolak', () => {
  const root = project({ 'a.txt': 'x\n', '.env': 'K=1\n' });
  for (const p of ['.env', '.github/w.yml', 'node_modules/x.js', '../luar.txt', '/etc/x', '.git/config']) {
    assert.equal(planPatch([create(p, 'a\n')]).ok, false, p);
  }
  if (process.platform !== 'win32') {
    fs.symlinkSync(path.join(root, 'a.txt'), path.join(root, 'link.txt'));
    assert.match(planPatch([edit('link.txt', 'x', 'y')]).error, /symlink/);
  }
});

test('create di atas file yang ada, edit file yang belum ada, delete yang tidak ada, rename ke tujuan ada', () => {
  project({ 'a.txt': 'x\n', 'b.txt': 'y\n' });
  assert.match(planPatch([create('a.txt', 'z\n')]).error, /sudah ada/);
  assert.match(planPatch([edit('nope.txt', 'a', 'b')]).error, /belum ada/);
  assert.match(planPatch([{ op: 'delete', path: 'nope.txt' }]).error, /tidak ada/);
  assert.match(planPatch([{ op: 'rename', from: 'a.txt', to: 'b.txt' }]).error, /sudah ada/);
  assert.match(planPatch([{ op: 'rename', from: 'a.txt', to: 'a.txt' }]).error, /sama/);
});

test('patch yang hasil akhirnya tidak mengubah apa pun ditolak', () => {
  project({ 'a.txt': 'x\n' });
  const r = planPatch([edit('a.txt', 'x', 'y'), edit('a.txt', 'y', 'x')]);
  assert.equal(r.ok, false);
  assert.match(r.error, /tidak mengubah apa pun/);
});

test('rename memindahkan isi (termasuk hasil edit sebelumnya) dan hash prasyarat dua path', () => {
  project({ 'a.txt': 'x\n' });
  const r = planPatch([edit('a.txt', 'x', 'y'), { op: 'rename', from: 'a.txt', to: 'dir/b.txt' }]);
  assert.ok(r.ok, r.error);
  const byRel = Object.fromEntries(r.plan.writes.map((w) => [w.rel, w]));
  assert.equal(byRel['a.txt'].action, 'delete');
  assert.equal(byRel['dir/b.txt'].action, 'create');
  assert.equal(byRel['dir/b.txt'].after.buf.toString('utf8'), 'y\n');
  assert.deepEqual(r.plan.touched.map((t) => t.op), ['edit', 'rename-from', 'rename-to']);
});

test('tanpa folder proyek: ditolak', () => {
  ws.clearRoot();
  assert.match(planPatch([create('a.txt', 'x')]).error, /folder proyek/i);
});