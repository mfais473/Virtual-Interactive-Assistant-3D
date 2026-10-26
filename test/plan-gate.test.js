require('./helpers/stub-modules');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ws = require('../src/workspace/workspace');
const gate = require('../src/agent/plan-gate');
const { planPatch } = require('../src/patch/patch-plan');
const tools = require('../src/tools');
const propose = tools.getTool('project_propose_plan');
const edit = (p, o, n) => ({ op: 'edit', path: p, oldText: o, newText: n });

function project(files = { 'a.js': 'x\n', 'b.js': 'y\n', 'c.js': 'z\n', 'package.json': '{}\n' }) {
  gate.__test.reset();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'via-pg-'));
  const root = ws.setRoot(dir).root;
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(root, n), c);
  return root;
}
const rencana = (extra = {}) => ({
  ringkasan: 'ubah a dan tambah d', anggaranBaris: 10,
  files: [{ path: 'a.js', op: 'edit' }, { path: 'd.js', op: 'create' }], ...extra,
});
function approve(r = rencana()) {
  const m = gate.buildManifest(r);
  assert.ok(m.ok, m.error);
  gate.activate(m.manifest, m.digest);
  return m;
}
const patch = (ops) => { const r = planPatch(ops); assert.ok(r.ok, r.error); return r.plan; };

test('buildManifest: valid, terklasifikasi aditif, digest stabil; string JSON diterima', () => {
  project();
  const a = gate.buildManifest(rencana());
  assert.ok(a.ok, a.error);
  assert.equal(a.manifest.kind, 'additive');
  assert.deepEqual(a.manifest.files.map((f) => f.path), ['a.js', 'd.js']);
  assert.equal(gate.buildManifest(JSON.stringify(rencana())).digest, a.digest);
  assert.notEqual(gate.buildManifest(rencana({ anggaranBaris: 11 })).digest, a.digest);
});

test('buildManifest: menolak masukan buruk', () => {
  project();
  const bad = [
    '{rusak', [], { files: [] }, rencana({ ringkasan: '' }), rencana({ anggaranBaris: 0 }), rencana({ anggaranBaris: 5000 }),
    rencana({ anggaranBaris: 'banyak' }), rencana({ files: [{ path: 'a.js', op: 'sihir' }] }),
    rencana({ files: [{ path: '.env', op: 'edit' }] }), rencana({ files: [{ path: '../x', op: 'create' }] }),
    rencana({ files: [{ path: 'a.js', op: 'rename' }] }),
    rencana({ files: Array.from({ length: 31 }, (_, i) => ({ path: `f${i}.js`, op: 'create' })) }),
  ];
  for (const b of bad) assert.equal(gate.buildManifest(b).ok, false, JSON.stringify(b).slice(0, 60));
});

test('klasifikasi rencana: hapus / rename / package.json = destruktif', () => {
  project();
  assert.equal(gate.buildManifest(rencana({ files: [{ path: 'a.js', op: 'delete' }] })).manifest.kind, 'destructive');
  assert.equal(gate.buildManifest(rencana({ files: [{ path: 'a.js', op: 'rename', to: 'z.js' }] })).manifest.kind, 'destructive');
  assert.equal(gate.buildManifest(rencana({ files: [{ path: 'package.json', op: 'edit' }] })).manifest.kind, 'destructive');
});

test('tanpa rencana aktif: state none', () => {
  project();
  assert.equal(gate.evaluate(patch([edit('a.js', 'x', 'q')])).state, 'none');
});

test('patch aditif di dalam rencana: inside + auto', () => {
  project();
  approve();
  const ev = gate.evaluate(patch([edit('a.js', 'x', 'q'), { op: 'create', path: 'd.js', content: 'd\n' }]));
  assert.deepEqual(ev, { state: 'inside', auto: true });
});

test('penyimpangan: file di luar rencana', () => {
  project();
  approve();
  const ev = gate.evaluate(patch([edit('b.js', 'y', 'q')]));
  assert.equal(ev.state, 'deviation');
  assert.match(ev.reasons[0], /di luar rencana: b\.js/);
});

test('penyimpangan: jenis operasi di luar rencana (edit di rencana, tapi patch membuat/menghapus)', () => {
  project();
  approve(rencana({ files: [{ path: 'a.js', op: 'edit' }, { path: 'd.js', op: 'edit' }] }));
  const ev = gate.evaluate(patch([{ op: 'create', path: 'd.js', content: 'd\n' }]));
  assert.equal(ev.state, 'deviation');
  assert.match(ev.reasons.join(' '), /operasi di luar rencana: d\.js \(create; rencana: edit\)/);
});

test('penyimpangan: aditif -> destruktif (hapus file yang ada di manifest sebagai edit)', () => {
  project();
  approve(rencana({ files: [{ path: 'a.js', op: 'edit' }] }));
  const ev = gate.evaluate(patch([{ op: 'delete', path: 'a.js' }]));
  assert.equal(ev.state, 'deviation');
  assert.match(ev.reasons.join(' '), /aditif tetapi patch bersifat merusak/);
});

test('penyimpangan: anggaran baris (kumulatif lewat recordApplied)', () => {
  project();
  approve(rencana({ anggaranBaris: 5 }));
  const p = patch([edit('a.js', 'x', 'q')]);               
  assert.equal(gate.evaluate(p).state, 'inside');
  gate.recordApplied(2);
  assert.equal(gate.evaluate(p).state, 'inside');          
  gate.recordApplied(2);
  const ev = gate.evaluate(p);                             
  assert.equal(ev.state, 'deviation');
  assert.match(ev.reasons[0], /anggaran baris terlampaui/);
});

test('rencana destruktif: patch destruktif di dalamnya TIDAK auto (tetap tanya)', () => {
  project();
  approve(rencana({ files: [{ path: 'a.js', op: 'delete' }, { path: 'b.js', op: 'edit' }] }));
  assert.deepEqual(gate.evaluate(patch([{ op: 'delete', path: 'a.js' }])), { state: 'inside', auto: false });
  assert.deepEqual(gate.evaluate(patch([edit('b.js', 'y', 'q')])), { state: 'inside', auto: true });
});

test('rename dan package.json: dibatasi manifest; package.json di dalam rencana tetap tidak auto', () => {
  project();
  approve(rencana({ files: [{ path: 'a.js', op: 'rename', to: 'z.js' }, { path: 'package.json', op: 'edit' }] }));
  assert.deepEqual(gate.evaluate(patch([{ op: 'rename', from: 'a.js', to: 'z.js' }])), { state: 'inside', auto: false });
  assert.equal(gate.evaluate(patch([{ op: 'rename', from: 'a.js', to: 'lain.js' }])).state, 'deviation');
  assert.deepEqual(gate.evaluate(patch([edit('package.json', '{}', '{"a":1}')])), { state: 'inside', auto: false });
});

test('TTL 10 menit: lewat -> none; pergantian folder -> none', () => {
  project();
  let t = 1_000_000;
  gate.__test.setNow(() => t);
  approve();
  const p = patch([edit('a.js', 'x', 'q')]);
  t += gate.PLAN_TTL_MS - 1;
  assert.equal(gate.evaluate(p).state, 'inside');
  t += 2;
  assert.equal(gate.evaluate(p).state, 'none');
  assert.equal(gate.current(), null);
  t = 5_000_000;
  approve();
  project();                                               
  gate.__test.setNow(() => t);
  assert.equal(gate.current(), null);
});

test('renderBlock: menyebut file, anggaran, ringkasan sebagai DATA; kosong tanpa rencana', () => {
  project();
  assert.equal(gate.renderBlock(), '');
  approve(rencana({ ringkasan: 'ubah <script> a' }));
  const b = gate.renderBlock();
  assert.match(b, /Rencana Aktif/);
  assert.match(b, /a\.js: edit/);
  assert.match(b, /anggaran: 10 dari 10/i);
  assert.ok(!b.includes('<script>'));
});

test('tool project_propose_plan: alwaysConfirm, validate, describe, digest mengikat persetujuan', async () => {
  project();
  assert.equal(propose.alwaysConfirm, true);
  process.env.VIA_AUTO_TOOLS = 'project_propose_plan';
  try { assert.equal(tools.permissionOf(propose), 'confirm'); } finally { delete process.env.VIA_AUTO_TOOLS; }

  const args = tools.normalizeArgs(propose, { rencana: JSON.stringify(rencana()) }).args;
  assert.equal(await tools.validateCall(propose, args), null);
  assert.match(tools.describeCall(propose, args), /Boleh aku mengajukan rencana: ubah a dan tambah d\. Menyentuh 2 file/);
  assert.match(tools.describeCall(propose, args), /Anggaran 10 baris/);
  assert.ok(!/PERHATIAN/.test(tools.describeCall(propose, args)));
  const risky = tools.normalizeArgs(propose, { rencana: JSON.stringify(rencana({ files: [{ path: 'a.js', op: 'delete' }] })) }).args;
  assert.match(tools.describeCall(propose, risky), /PERHATIAN/);
  assert.ok(await tools.validateCall(propose, { rencana: '{rusak' }));

  assert.equal((await tools.executeTool('project_propose_plan', args, {})).code, 'NO_DIGEST');
  assert.equal(gate.current(), null, 'tanpa digest tidak aktif');
  const other = tools.digestOf(propose, tools.normalizeArgs(propose, { rencana: JSON.stringify(rencana({ anggaranBaris: 99 })) }).args);
  assert.equal((await tools.executeTool('project_propose_plan', args, { approvedDigest: other })).code, 'DIGEST_MISMATCH');
  assert.equal(gate.current(), null);

  const ok = await tools.executeTool('project_propose_plan', args, { approvedDigest: tools.digestOf(propose, args) });
  assert.ok(ok.success, ok.error);
  assert.ok(gate.current());
  assert.equal(gate.current().manifest.budget, 10);
});