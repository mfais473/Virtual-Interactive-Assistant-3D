const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ws = require('../src/workspace/workspace');

function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

test('setRoot menolak root drive, folder home, folder sistem, dan bukan-folder', () => {
  assert.ok(ws.setRoot(path.parse(process.cwd()).root).error);
  assert.ok(ws.setRoot(os.homedir()).error);
  assert.ok(ws.setRoot(path.dirname(os.homedir())).error || path.dirname(os.homedir()) === path.parse(os.homedir()).root);
  if (process.platform !== 'win32') assert.ok(ws.setRoot('/etc').error);
  const f = path.join(tmp('via-ws-'), 'a.txt');
  fs.writeFileSync(f, 'x');
  assert.ok(ws.setRoot(f).error);
  assert.ok(ws.setRoot(path.join(os.tmpdir(), 'tidak-ada-xyz')).error);
});

test('setRoot menerima folder proyek biasa dan renderBlock menyebut namanya (disanitasi)', () => {
  ws.clearRoot();
  assert.equal(ws.renderBlock(), '');
  const dir = tmp('via-ws-');
  const res = ws.setRoot(dir);
  assert.ok(res.root, res.error);
  assert.match(ws.renderBlock(), /Folder Proyek Aktif/);
  assert.ok(!ws.renderBlock().includes('<script>'));
});

test('resolveInRoot: path aman diterima, jalan keluar ditolak', () => {
  const dir = tmp('via-ws-');
  ws.setRoot(dir);
  const ok = ws.resolveInRoot('src/app.js', 'write');
  assert.ok(!ok.error);
  assert.equal(ok.rel, 'src/app.js');
  for (const bad of ['../x.txt', 'src/../../x.txt', '/etc/passwd', 'C:\\Windows\\x', '\\\\server\\share\\x', '', '   ']) {
    assert.ok(ws.resolveInRoot(bad, 'read').error, `harus ditolak: "${bad}"`);
  }
  assert.ok(ws.resolveInRoot('a\0b', 'read').error);
  assert.ok(ws.resolveInRoot('.', 'read').error);               
  assert.ok(ws.resolveInRoot('.', 'read', { allowRoot: true }).isRoot);
});

test('resolveInRoot: area rahasia ditolak untuk baca DAN tulis, .env.example boleh', () => {
  ws.setRoot(tmp('via-ws-'));
  for (const bad of ['.env', '.env.local', 'cfg/.env.production', '.git/config', 'x/.ssh/id_rsa', 'k.pem', 'id_ed25519', '.npmrc', 'A/.GIT/HEAD', '.ENV']) {
    assert.ok(ws.resolveInRoot(bad, 'read').error, `read harus ditolak: ${bad}`);
    assert.ok(ws.resolveInRoot(bad, 'write').error, `write harus ditolak: ${bad}`);
  }
  assert.ok(!ws.resolveInRoot('.env.example', 'read').error);
});

test('resolveInRoot: folder terlindungi bisa dibaca tapi tidak ditulis', () => {
  ws.setRoot(tmp('via-ws-'));
  for (const p of ['.github/workflows/ci.yml', '.vscode/tasks.json', '.husky/pre-commit', 'node_modules/x/index.js', '.idea/a.xml']) {
    assert.ok(!ws.resolveInRoot(p, 'read').error, `read ok: ${p}`);
    assert.ok(ws.resolveInRoot(p, 'write').error, `write ditolak: ${p}`);
  }
});

test('resolveInRoot: symlink keluar folder atau ke file rahasia ditolak', { skip: process.platform === 'win32' }, () => {
  const dir = tmp('via-ws-');
  const outside = tmp('via-out-');
  fs.writeFileSync(path.join(outside, 'rahasia.txt'), 'top secret');
  fs.writeFileSync(path.join(dir, '.env'), 'KEY=1');
  ws.setRoot(dir);
  fs.symlinkSync(outside, path.join(dir, 'link-folder'));
  fs.symlinkSync(path.join(outside, 'rahasia.txt'), path.join(dir, 'link-file'));
  fs.symlinkSync(path.join(dir, '.env'), path.join(dir, 'link-env'));
  assert.match(ws.resolveInRoot('link-folder/rahasia.txt', 'read').error, /luar folder/);
  assert.match(ws.resolveInRoot('link-file', 'read').error, /luar folder/);
  assert.match(ws.resolveInRoot('link-folder/baru.txt', 'write').error, /luar folder/);
  assert.ok(ws.resolveInRoot('link-env', 'read').error);   // lolos lexical, ketahuan setelah realpath
});

test('nameError: karakter/nama khusus Windows', () => {
  const { nameError } = ws.__test;
  assert.ok(nameError('a\u0001b'));
  if (process.platform === 'win32') {
    for (const bad of ['.env::$DATA', 'nul', 'src/CON.txt', 'a?.js', 'x. ']) assert.ok(nameError(bad), bad);
  } else {
    assert.equal(nameError('a:b'), null);
  }
});