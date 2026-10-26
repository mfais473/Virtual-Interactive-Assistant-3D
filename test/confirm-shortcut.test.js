require('./helpers/stub-modules');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { shortcutDecision } = require('../src/agent/confirmation');
const agent = require('../src/agent/agent-loop');

test('shortcutDecision: hanya approve/deny/ask; format lama {approved} dan payload asing ditolak', () => {
  assert.deepEqual(shortcutDecision({ decision: 'approve' }), { decision: 'approve', label: '[tombol Y]' });
  assert.deepEqual(shortcutDecision({ decision: 'deny' }), { decision: 'deny', label: '[tombol N]' });
  assert.deepEqual(shortcutDecision({ decision: 'ask' }), { decision: 'ask', label: '[tombol T]' });
  for (const bad of [{ approved: true }, { decision: 'yes' }, { decision: true }, { decision: '__proto__' }, { decision: 'toString' }, null, undefined, 'approve', 42, {}]) {
    assert.equal(shortcutDecision(bad), null, JSON.stringify(bad));
  }
});

test('teks izin menyebut Y, N, dan T', () => {
  const t = agent.__test.permissionSpeech('Boleh aku menerapkan patch?', 'alasan');
  assert.match(t, /Alasanku: alasan\./);
  assert.match(t, /Y untuk ya/);
  assert.match(t, /N untuk tidak/);
  assert.match(t, /T untuk tanya dulu/);
});

test('sumber renderer/preload/IPC memakai payload {decision} dan tombol T; avatar tidak disentuh', () => {
  const kb = fs.readFileSync(require.resolve('../src/input/keyboard.js'), 'utf8');
  assert.match(kb, /case 't':/);
  assert.match(kb, /\{ y: 'approve', n: 'deny', t: 'ask' \}/);
  assert.match(kb, /confirmShortcut\(decision\)/);
  const pre = fs.readFileSync(require.resolve('../preload.js'), 'utf8');
  assert.match(pre, /\{ decision \}/);
  assert.ok(!/approved/.test(pre));
  const ipc = fs.readFileSync(require.resolve('../src/core/ipc-handlers.js'), 'utf8');
  assert.match(ipc, /shortcutDecision\(payload\)/);
  assert.ok(!/\{ approved \}/.test(ipc));
});
