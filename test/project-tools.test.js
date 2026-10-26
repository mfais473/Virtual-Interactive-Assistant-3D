require('./helpers/stub-modules');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ws = require('../src/workspace/workspace');
const tools = require('../src/tools');
const edit = require('../src/tools/project-edit-file');
const write = require('../src/tools/project-write-file');
const read = tools.getTool('project_read_file');
const list = tools.getTool('project_list');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'via-pt-'));
  const bak = fs.mkdtempSync(path.join(os.tmpdir(), 'via-bak-'));
  ws.setBackupDir(bak);
  const res = ws.setRoot(dir);
  return { dir: res.root, bak };
}
const norm = (tool, args) => tools.normalizeArgs(tool, args).args;

test('normalizeArgs: raw menjaga spasi, allowEmpty menerima string kosong, tanpa raw tetap dipangkas', () => {
  const a = norm(edit, { path: ' src/a.js ', oldText: '  indent\n', newText: '', replaceAll: ' true ' });
  assert.equal(a.path, 'src/a.js');
  assert.equal(a.oldText, '  indent\n');
  assert.equal(a.newText, '');
  assert.equal(a.replaceAll, 'true');
  assert.ok(tools.normalizeArgs(edit, { path: 'a', oldText: 'x' }).error);         
  assert.ok(tools.normalizeArgs(edit, { path: 'a', oldText: '   ', newText: 'y' }).error); 
  assert.equal(norm(write, { path: 'a.txt', content: '' }).content, '');
});

test('permissionOf: alwaysConfirm tidak bisa dilonggarkan lewat VIA_AUTO_TOOLS', () => {
  process.env.VIA_AUTO_TOOLS = 'project_edit_file,project_write_file,open_browser';
  try {
    for (const t of [edit, write]) assert.equal(tools.permissionOf(t), 'confirm', t.name);
    assert.equal(tools.permissionOf(tools.getTool('open_browser')), 'auto');   
  } finally { delete process.env.VIA_AUTO_TOOLS; }
});

test('edit: ganti unik, hapus dengan newText kosong, $& tidak diperlakukan sebagai pola', async () => {
  const { dir } = setup();
  fs.writeFileSync(path.join(dir, 'a.js'), 'const x = 1;\nconst y = 2;\n');
  let r = await edit.execute(norm(edit, { path: 'a.js', oldText: 'const x = 1;', newText: 'const x = "$& $1";' }));
  assert.ok(r.success, r.error);
  assert.equal(fs.readFileSync(path.join(dir, 'a.js'), 'utf8'), 'const x = "$& $1";\nconst y = 2;\n');
  r = await edit.execute(norm(edit, { path: 'a.js', oldText: 'const y = 2;\n', newText: '' }));
  assert.ok(r.success, r.error);
  assert.equal(fs.readFileSync(path.join(dir, 'a.js'), 'utf8'), 'const x = "$& $1";\n');
  assert.equal(r.linesRemoved, 2);
});

test('edit: tidak cocok / ganda / sama ditolak tanpa mengubah file; replaceAll bekerja', async () => {
  const { dir } = setup();
  const f = path.join(dir, 'b.txt');
  fs.writeFileSync(f, 'foo\nbar\nfoo\n');
  assert.match((await edit.execute(norm(edit, { path: 'b.txt', oldText: 'baz', newText: 'q' }))).error, /tidak ditemukan/);
  assert.match((await edit.execute(norm(edit, { path: 'b.txt', oldText: 'foo', newText: 'q' }))).error, /2 kali/);
  assert.match((await edit.execute(norm(edit, { path: 'b.txt', oldText: 'foo', newText: 'foo' }))).error, /Tidak ada perubahan/);
  assert.equal(fs.readFileSync(f, 'utf8'), 'foo\nbar\nfoo\n');
  const r = await edit.execute(norm(edit, { path: 'b.txt', oldText: 'foo', newText: 'q', replaceAll: 'true' }));
  assert.ok(r.success);
  assert.equal(r.replacements, 2);
  assert.equal(fs.readFileSync(f, 'utf8'), 'q\nbar\nq\n');
});

test('edit: file CRLF tetap CRLF dan model yang menulis LF tetap cocok', async () => {
  const { dir } = setup();
  const f = path.join(dir, 'win.txt');
  fs.writeFileSync(f, 'baris1\r\nbaris2\r\nbaris3\r\n');
  const r = await edit.execute(norm(edit, { path: 'win.txt', oldText: 'baris1\nbaris2', newText: 'A\nB\nC' }));
  assert.ok(r.success, r.error);
  assert.equal(fs.readFileSync(f, 'utf8'), 'A\r\nB\r\nC\r\nbaris3\r\n');
});

test('edit: backup isi lama dibuat di luar folder proyek, tanpa sisa file temp', async () => {
  const { dir, bak } = setup();
  fs.writeFileSync(path.join(dir, 'c.txt'), 'lama');
  const r = await edit.execute(norm(edit, { path: 'c.txt', oldText: 'lama', newText: 'baru' }));
  assert.ok(r.backupSaved);
  const found = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : found.push(path.join(d, e.name)); })(bak);
  assert.equal(found.length, 1);
  assert.equal(fs.readFileSync(found[0], 'utf8'), 'lama');
  assert.deepEqual(fs.readdirSync(dir), ['c.txt']);
});

test('edit/write: file rahasia, folder terlindungi, file di luar proyek, file belum ada', async () => {
  const { dir } = setup();
  fs.writeFileSync(path.join(dir, '.env'), 'KEY=1');
  assert.ok(await tools.validateCall(edit, norm(edit, { path: '.env', oldText: 'KEY', newText: 'X' })));
  assert.ok(await tools.validateCall(write, norm(write, { path: '.github/workflows/x.yml', content: 'a' })));
  assert.ok(await tools.validateCall(write, norm(write, { path: '../keluar.txt', content: 'a' })));
  assert.ok(await tools.validateCall(write, norm(write, { path: path.join(os.tmpdir(), 'abs.txt'), content: 'a' })));
  assert.match(await tools.validateCall(edit, norm(edit, { path: 'tidak-ada.js', oldText: 'a', newText: 'b' })), /belum ada/);
  assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), 'KEY=1');
});

test('edit: file bukan UTF-8 (Latin-1) ditolak, tidak diubah, tidak dibackup', async () => {
  const { dir, bak } = setup();
  const f = path.join(dir, 'ansi.txt');
  const bytes = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a, 0x78, 0x0a]);  
  fs.writeFileSync(f, bytes);
  const args = norm(edit, { path: 'ansi.txt', oldText: 'x', newText: 'y' });
  assert.match(await tools.validateCall(edit, args), /bukan UTF-8/);
  const r = await edit.execute(args);
  assert.equal(r.success, false);
  assert.match(r.error, /bukan UTF-8/);
  assert.ok(fs.readFileSync(f).equals(bytes), 'byte asli tidak boleh berubah');
  assert.deepEqual(fs.readdirSync(bak), [], 'tidak ada backup karena tidak ada penulisan');
});

test('edit: UTF-8 sah (aksen, emoji, BOM) tetap utuh byte-per-byte di luar bagian yang diedit', async () => {
  const { dir } = setup();
  const f = path.join(dir, 'u.txt');
  fs.writeFileSync(f, '\ufeffcafé 😀\nbaris x\n', 'utf8');
  const r = await edit.execute(norm(edit, { path: 'u.txt', oldText: 'x', newText: 'y' }));
  assert.ok(r.success, r.error);
  assert.equal(fs.readFileSync(f, 'utf8'), '\ufeffcafé 😀\nbaris y\n');
});

test('edit: describe menyebut jumlah baris dari argumen asli (yang diucapkan = yang dijalankan)', () => {
  const { dir } = setup();
  fs.writeFileSync(path.join(dir, 'd.js'), 'a\nb\nc\n');
  const args = norm(edit, { path: 'd.js', oldText: 'a\nb', newText: 'x' });
  assert.equal(tools.describeCall(edit, args), 'Boleh aku mengubah file d.js: mengganti 2 baris dengan 1 baris?');
});

test('write: file baru (folder induk dibuat), timpa file lama (backup + CRLF dipertahankan)', async () => {
  const { dir } = setup();
  let r = await write.execute(norm(write, { path: 'src/util/h.js', content: 'export {}\n' }));
  assert.ok(r.success && r.created, r.error);
  assert.equal(fs.readFileSync(path.join(dir, 'src/util/h.js'), 'utf8'), 'export {}\n');
  fs.writeFileSync(path.join(dir, 'w.txt'), 'x\r\ny\r\n');
  assert.match(tools.describeCall(write, norm(write, { path: 'w.txt', content: 'a\nb' })), /MENIMPA/);
  r = await write.execute(norm(write, { path: 'w.txt', content: 'a\nb\n' }));
  assert.ok(r.success && !r.created && r.backupSaved);
  assert.equal(fs.readFileSync(path.join(dir, 'w.txt'), 'utf8'), 'a\r\nb\r\n');
});

test('write: symlink ditolak', { skip: process.platform === 'win32' }, async () => {
  const { dir } = setup();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'via-out-'));
  fs.writeFileSync(path.join(outside, 't.txt'), 'orig');
  fs.symlinkSync(path.join(outside, 't.txt'), path.join(dir, 'ln.txt'));
  assert.ok(await tools.validateCall(write, norm(write, { path: 'ln.txt', content: 'hack' })));
  assert.equal(fs.readFileSync(path.join(outside, 't.txt'), 'utf8'), 'orig');
});

test('read: halaman bertahap, EOL terdeteksi, biner dan file besar ditolak, rahasia ditolak', async () => {
  const { dir } = setup();
  fs.writeFileSync(path.join(dir, 'big.txt'), Array.from({ length: 450 }, (_, i) => `l${i + 1}`).join('\r\n') + '\r\n');
  let r = await read.execute(norm(read, { path: 'big.txt', maxLines: '1000' }));
  assert.ok(r.success);
  assert.equal(r.eol, 'CRLF');
  assert.equal(r.endLine, 400);
  assert.equal(r.nextStartLine, 401);
  assert.equal(r.complete, false);
  assert.ok(!r.text.includes('\r'));
  r = await read.execute(norm(read, { path: 'big.txt', startLine: '401' }));
  assert.equal(r.endLine, 450);
  assert.equal(r.nextStartLine, undefined);
  fs.writeFileSync(path.join(dir, 'kecil.txt'), 'a\nb\n');
  assert.equal((await read.execute(norm(read, { path: 'kecil.txt' }))).complete, true);
  fs.writeFileSync(path.join(dir, 'x.bin'), Buffer.from([1, 2, 0, 3]));
  assert.match((await read.execute(norm(read, { path: 'x.bin' }))).error, /biner/);
  fs.writeFileSync(path.join(dir, 'huge.txt'), 'a'.repeat(600 * 1024));
  assert.match((await read.execute(norm(read, { path: 'huge.txt' }))).error, /terlalu besar/);
  fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1');
  assert.ok(await tools.validateCall(read, norm(read, { path: '.env' })));
});

test('list: menyembunyikan .git/.env, melewati node_modules, tidak mengikuti symlink', async () => {
  const { dir } = setup();
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.mkdirSync(path.join(dir, 'node_modules/pkg'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'x');
  fs.writeFileSync(path.join(dir, '.env'), 's');
  fs.writeFileSync(path.join(dir, 'node_modules/pkg/i.js'), 'x');
  const r = await list.execute(norm(list, {}));
  assert.ok(r.success);
  assert.match(r.text, /src\//);
  assert.match(r.text, /src\/a\.js/);
  assert.match(r.text, /node_modules\/ \(dilewati\)/);
  assert.ok(!r.text.includes('.git'));
  assert.ok(!r.text.includes('.env'));
  assert.ok(!r.text.includes('pkg'));
  assert.ok((await list.execute(norm(list, { path: '../' }))).error);
});

test('registry: edit_file/write_file dicabut; apply_patch, propose_plan, read_log terdaftar; tanpa tool shell', () => {
  assert.equal(tools.getTool('project_edit_file'), null);
  assert.equal(tools.getTool('project_write_file'), null);
  assert.equal(tools.getTool('project_run_command'), null);
  const names = tools.getToolSchemas().map((t) => t.name);
  for (const n of ['apply_patch', 'project_propose_plan', 'project_read_log', 'project_read_file', 'project_list', 'project_pick_folder']) {
    assert.ok(names.includes(n), n);
  }
  assert.ok(!names.some((n) => /edit_file|write_file|run_command|shell|exec/.test(n)));
  assert.equal(typeof edit.execute, 'function');
  assert.equal(typeof write.execute, 'function');
});

test('prompt coding: alur rencana -> patch bertahap -> jangan menyimpang -> laporkan; tanpa sisa isolasi OS/run_command', () => {
  const { CODING_PROMPT } = require('../src/ai/coding-prompt');
  const { SYSTEM_PROMPT } = require('../src/ai/prompt-builder');
  for (const t of ['project_propose_plan', 'apply_patch', 'project_read_log', 'JANGAN menyimpang', 'Laporkan']) {
    assert.ok(CODING_PROMPT.includes(t), t);
  }
  for (const text of [CODING_PROMPT, SYSTEM_PROMPT]) {
    assert.ok(!new RegExp(['project_run_command', 'project_edit_file', 'project_write_file', 'sand' + 'box'].join('|'), 'i').test(text));
  }
  assert.ok(SYSTEM_PROMPT.includes('apply_patch'));
});