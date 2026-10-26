process.env.VIA_MAX_CODING_STEPS = '8';
require('./helpers/stub-modules');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const llm = require('../src/ai/llm-client');
const ws = require('../src/workspace/workspace');
const agent = require('../src/agent/agent-loop');
const gate = require('../src/agent/plan-gate');

function script(items) {
  const seen = [];
  let i = 0;
  llm.callLLM = async (opts) => {
    seen.push({ phase: opts.phase, system: opts.system, tools: opts.tools, messages: opts.messages });
    const item = typeof items === 'function' ? items(seen.length - 1, opts) : items[Math.min(i++, items.length - 1)];
    return { text: '', toolCalls: [], ...item };
  };
  return seen;
}
const call = (name, args, id = name) => ({ toolCalls: [{ id, name, args: { alasan: 'tes', ...args } }] });
const say = (text) => ({ text });
const patchCall = (ops, id = 'p') => call('apply_patch', { operations: JSON.stringify(ops) }, id);
const planCall = (rencana, id = 'plan') => call('project_propose_plan', { rencana: JSON.stringify(rencana) }, id);
const edit = (p, o, n) => ({ op: 'edit', path: p, oldText: o, newText: n });
const rencana = (extra = {}) => ({
  ringkasan: 'ubah a.js dan tambah d.js', anggaranBaris: 20,
  files: [{ path: 'a.js', op: 'edit' }, { path: 'd.js', op: 'create' }], ...extra,
});
const toolTexts = (seen) => seen[seen.length - 1].messages.filter((m) => m.role === 'tool').map((m) => m.text);

function project(files = { 'a.js': 'const x = 1;\n', 'b.js': 'const y = 1;\n' }) {
  agent.__test.reset();
  gate.__test.reset();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'via-ap-'));
  ws.setBackupDir(fs.mkdtempSync(path.join(os.tmpdir(), 'via-ap-bak-')));
  const root = ws.setRoot(dir).root;
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(root, n), c);
  agent.cancelPending();
  return root;
}
const read = (root, n) => fs.readFileSync(path.join(root, n), 'utf8');

async function approvePlan(r = rencana(), extra = []) {
  const seen = script([planCall(r), ...extra]);
  const out = await agent.startTurn('kerjakan');
  assert.equal(out.done, false);
  assert.match(out.rawText, /Boleh aku mengajukan rencana/);
  return { seen, out };
}

test('tanpa rencana: patch aditif pun WAJIB izin; Y -> tertulis', async () => {
  const root = project();
  script([patchCall([edit('a.js', 'x = 1', 'x = 2')]), say('[senang] Beres.')]);
  const out = await agent.startTurn('ubah x');
  assert.equal(out.done, false);
  assert.match(out.rawText, /Boleh aku menerapkan patch/);
  assert.equal(read(root, 'a.js'), 'const x = 1;\n');
  const out2 = await agent.answerPending(true);
  assert.equal(out2.done, true);
  assert.equal(read(root, 'a.js'), 'const x = 2;\n');
});

test('rencana disetujui -> patch aditif di dalamnya jalan TANPA tanya, termasuk setelah taint', async () => {
  const root = project();
  const { seen } = await approvePlan(rencana(), [
    call('project_read_file', { path: 'a.js' }, 'r'),                 // taint
    patchCall([edit('a.js', 'x = 1', 'x = 2'), { op: 'create', path: 'd.js', content: 'd\n' }]),
    say('[senang] Selesai.'),
  ]);
  const out = await agent.answerPending(true);                         // setujui rencana
  assert.equal(out.done, true, 'patch dalam rencana tidak bertanya lagi');
  assert.equal(read(root, 'a.js'), 'const x = 2;\n');
  assert.equal(read(root, 'd.js'), 'd\n');
  assert.ok(toolTexts(seen).join('\n').includes('Patch diterapkan'));
  assert.ok(seen.some((s) => s.system.includes('Rencana Aktif')), 'model melihat rencananya');
});

test('patch DESTRUKTIF di dalam rencana destruktif tetap minta izin', async () => {
  const root = project();
  await approvePlan(rencana({ files: [{ path: 'b.js', op: 'delete' }, { path: 'a.js', op: 'edit' }] }), [
    patchCall([{ op: 'delete', path: 'b.js' }]),
    say('[tenang] ok'),
  ]);
  const out = await agent.answerPending(true);
  assert.equal(out.done, false);
  assert.match(out.rawText, /PERHATIAN/);
  assert.ok(fs.existsSync(path.join(root, 'b.js')));
  await agent.answerPending(false);
  assert.ok(fs.existsSync(path.join(root, 'b.js')));
});

test('penyimpangan: file di luar rencana -> run.halted, tidak ada yang tertulis, tool dimatikan, rencana dicabut', async () => {
  const root = project();
  const seen = script((i) => [
    planCall(rencana()),
    patchCall([edit('b.js', 'y = 1', 'y = 2')]),
    call('project_list', {}, 'x'),
    say('[bingung] Aku berhenti karena menyimpang dari rencana.'),
  ][Math.min(i, 3)]);
  await agent.startTurn('kerjakan');
  const out = await agent.answerPending(true);
  assert.equal(out.done, true);
  assert.equal(read(root, 'b.js'), 'const y = 1;\n');
  const last = seen[seen.length - 1];
  assert.equal(last.tools.length, 0, 'setelah halted tidak ada tool');
  assert.match(toolTexts(seen).join('\n'), /PLAN_DEVIATION|menyimpang dari rencana/);
  assert.equal(gate.current(), null, 'rencana dicabut');
  assert.equal(agent.hasPending(), false);
});

test('penyimpangan: anggaran baris terlampaui -> halted; sisa panggilan di antrean tidak dijalankan', async () => {
  const root = project();
  seenAfter = script((i) => [
    planCall(rencana({ anggaranBaris: 3 })),
    { toolCalls: [
      { id: 'p1', name: 'apply_patch', args: { alasan: 't', operations: JSON.stringify([edit('a.js', 'x = 1', 'x = 2')]) } },   // 2 baris
      { id: 'p2', name: 'apply_patch', args: { alasan: 't', operations: JSON.stringify([{ op: 'create', path: 'd.js', content: '1\n2\n' }]) } },   // +2 > 3
    ] },
    say('[tenang] berhenti'),
  ][Math.min(i, 2)]);
  await agent.startTurn('kerjakan');
  const out = await agent.answerPending(true);
  assert.equal(out.done, true);
  assert.equal(read(root, 'a.js'), 'const x = 2;\n', 'patch pertama masih di dalam anggaran');
  assert.ok(!fs.existsSync(path.join(root, 'd.js')), 'patch kedua menyimpang dan tidak ditulis');
  assert.match(toolTexts(seenAfter).join('\n'), /anggaran baris terlampaui/);
});
let seenAfter;

test('penyimpangan: aditif -> destruktif', async () => {
  const root = project();
  const seen = script((i) => [planCall(rencana({ files: [{ path: 'a.js', op: 'edit' }] })), patchCall([{ op: 'delete', path: 'a.js' }]), say('[tenang] stop')][Math.min(i, 2)]);
  await agent.startTurn('kerjakan');
  await agent.answerPending(true);
  assert.ok(fs.existsSync(path.join(root, 'a.js')));
  assert.match(toolTexts(seen).join('\n'), /merusak/);
});

test('needsConfirm: hook tool hanya bisa MENGETATKAN; plan-gate satu-satunya pelonggar', () => {
  project();
  const { needsConfirm } = agent.__test;
  const run = { tainted: false };
  const writer = { name: 'x', permission: 'confirm', alwaysConfirm: true, needsConfirm: () => false };
  assert.equal(needsConfirm(writer, { args: {} }, run).confirm, true, 'hook false tidak melonggarkan');
  const reader = { name: 'y', permission: 'auto', needsConfirm: () => true };
  assert.equal(needsConfirm(reader, { args: {} }, run).confirm, true, 'hook true mengetatkan');
  const thrower = { name: 'z', permission: 'auto', needsConfirm: () => { throw new Error('x'); } };
  assert.equal(needsConfirm(thrower, { args: {} }, run).confirm, true);
  const auto = { name: 'a', permission: 'auto' };
  assert.equal(needsConfirm(auto, { args: {} }, run).confirm, false);
  assert.equal(needsConfirm(auto, { args: {} }, { tainted: true }).confirm, true, 'taint memaksa izin');
  assert.equal(needsConfirm({ ...auto, taintExempt: true }, { args: {} }, { tainted: true }).confirm, false);
  const fakePatch = { name: 'f', permission: 'confirm', alwaysConfirm: true, planGated: true, planOf: () => ({ ok: false }) };
  assert.equal(needsConfirm(fakePatch, { args: {} }, run).confirm, true);
});

async function startPatchAsk() {
  const root = project();
  const seen = script((i, opts) => {
    if (opts.tools.length === 0 && opts.system.includes('MODE TANYA')) return say('[tenang] Aku mengubah nilai x di a.js dari 1 jadi 2.');
    return [patchCall([edit('a.js', 'x = 1', 'x = 2')]), say('[senang] Beres.')][Math.min(i, 1)];
  });
  const out = await agent.startTurn('ubah x');
  assert.equal(out.done, false);
  return { root, seen };
}

test('mode tanya: "tanya dulu" -> masuk mode tanya; pertanyaan dijawab TANPA tool dan TIDAK menyetujui', async () => {
  const { root, seen } = await startPatchAsk();
  const o1 = await agent.resume('tanya dulu');
  assert.equal(o1.done, false);
  assert.match(o1.rawText, /apa yang mau kamu tanyakan/);
  const n = seen.length;
  const o2 = await agent.resume('apa saja yang kamu ubah dan kenapa harus diubah sekarang juga');   // >= 7 kata
  assert.equal(o2.done, false, 'kalimat panjang di mode tanya BUKAN permintaan baru');
  assert.equal(seen.length, n + 1);
  assert.deepEqual(seen[n].tools, []);
  assert.match(seen[n].system, /MODE TANYA/);
  assert.match(o2.rawText, /Aku mengubah nilai x/);
  assert.match(o2.rawText, /bilang ya atau tidak/);
  assert.equal(read(root, 'a.js'), 'const x = 1;\n');
  assert.ok(agent.hasPending());
  const o3 = await agent.resume('ya');
  assert.equal(o3.done, true);
  assert.equal(read(root, 'a.js'), 'const x = 2;\n');
});

test('mode tanya: "ya, tapi kenapa?" dan "oke jelaskan dulu" adalah pertanyaan, bukan setuju', async () => {
  const { root } = await startPatchAsk();
  await agent.resume('aku mau tanya');
  for (const t of ['ya, tapi kenapa?', 'oke jelaskan dulu', 'ya tapi tunggu dulu']) {
    const o = await agent.resume(t);
    assert.equal(o.done, false, t);
    assert.equal(read(root, 'a.js'), 'const x = 1;\n', t);
  }
});

test('mode tanya: "batalkan" menolak; "tidak" menolak', async () => {
  for (const no of ['batalkan', 'tidak']) {
    const { root } = await startPatchAsk();
    await agent.resume('tanya dulu');
    const o = await agent.resume(no);
    assert.equal(o.done, true);
    assert.equal(read(root, 'a.js'), 'const x = 1;\n');
    assert.equal(agent.hasPending(), false);
  }
});

test('mode tanya: pertanyaan yang menyertai "tanya dulu, ...?" langsung dijawab', async () => {
  const { seen } = await startPatchAsk();
  const n = seen.length;
  const o = await agent.resume('tanya dulu, kenapa kamu ubah file itu?');
  assert.equal(seen.length, n + 1);
  assert.match(o.rawText, /Aku mengubah nilai x/);
});

test('mode tanya: batas pertanyaan -> dianggap tidak jadi', async () => {
  const { root } = await startPatchAsk();
  await agent.resume('tanya dulu');
  for (let i = 0; i < agent.MAX_INQUIRY_QUESTIONS; i++) {
    const o = await agent.resume(`pertanyaan nomor ${i}?`);
    assert.equal(o.done, false);
  }
  const last = await agent.resume('satu lagi?');
  assert.equal(last.done, true);
  assert.equal(read(root, 'a.js'), 'const x = 1;\n');
  assert.equal(agent.hasPending(), false);
});

test('mode tanya: TTL kedaluwarsa dihitung dari pertukaran terakhir', async () => {
  await startPatchAsk();
  let t = 10_000_000;
  agent.__test.setNow(() => t);
  await agent.resume('tanya dulu');
  t += agent.INQUIRY_TTL_MS - 1000;
  assert.equal(agent.hasPending(), true);
  await agent.resume('kenapa?');
  t += agent.INQUIRY_TTL_MS - 1000;
  assert.equal(agent.hasPending(), true, 'diperpanjang oleh pertukaran terakhir');
  t += 2000;
  assert.equal(agent.hasPending(), false);
  agent.__test.reset();
});

test('di luar mode tanya heuristik 7 kata TETAP berlaku (permintaan baru membatalkan izin lama)', async () => {
  const { root } = await startPatchAsk();
  script([say('[netral] Cuaca cerah hari ini.')]);                 // giliran baru
  const o = await agent.resume('tolong buatkan aku ringkasan tentang cuaca hari ini ya');
  assert.equal(o.done, true);
  assert.match(o.rawText, /Cuaca cerah/);
  assert.equal(agent.hasPending(), false, 'izin lama dibatalkan');
  assert.equal(read(root, 'a.js'), 'const x = 1;\n');
});

test('answerPending("ask") = tombol T: masuk mode tanya; Y/N tetap bekerja di mode tanya', async () => {
  const { root } = await startPatchAsk();
  const o = await agent.answerPending('ask');
  assert.equal(o.done, false);
  assert.match(o.rawText, /apa yang mau kamu tanyakan/);
  const done = await agent.answerPending(true);
  assert.equal(done.done, true);
  assert.equal(read(root, 'a.js'), 'const x = 2;\n');
});