require('./helpers/stub-modules');
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyConfirmation, classifyInquiry } = require('../src/agent/confirmation');
const strict = (t) => classifyConfirmation(t, { strict: true });

test('strict: persetujuan tegas diterima', () => {
  for (const t of ['ya', 'iya', 'oke', 'silakan', 'lanjut', 'ya boleh', 'tidak masalah', 'nggak apa apa']) {
    assert.equal(strict(t), 'approve', t);
  }
});

test('strict: kata yang hanya menggaungkan pertanyaan atau menahan TIDAK dianggap setuju', () => {
  for (const t of ['baca dulu', 'bisa jelasin dulu?', 'lihat dulu perubahannya', 'mau tanya dulu',
    'boleh', 'tunggu sebentar', 'ya tapi tunggu dulu', 'apa yang kamu ubah?', 'bukan itu']) {
    assert.notEqual(strict(t), 'approve', t);
  }
});

test('strict: penolakan tetap menolak', () => {
  for (const t of ['tidak', 'jangan', 'batal', 'gausah', 'bukan itu', 'nggak boleh']) {
    assert.equal(strict(t), 'deny', t);
  }
  assert.equal(strict('ya tapi jangan'), 'unclear');
});

test('non-strict (tool baca/buka): perilaku lama tidak berubah', () => {
  assert.equal(classifyConfirmation('buka'), 'approve');
  assert.equal(classifyConfirmation('boleh'), 'approve');
  assert.equal(classifyConfirmation('jangan buka'), 'deny');
  assert.equal(classifyConfirmation('hmm'), 'unclear');
});

const loose = (t) => classifyConfirmation(t);

test('ask: "tanya dulu", "aku mau tanya", "tunggu dulu" menjadi ask, bukan unclear dan bukan approve', () => {
  for (const t of ['tanya dulu', 'aku mau tanya', 'aku mau tanya dulu', 'tunggu dulu', 'dulu', 'tunggu', 'sebentar',
    'bentar ya', 'ya tapi tunggu dulu', 'ya tapi aku mau tanya', 'boleh tanya dulu?', 'mau nanya dulu', 'wait']) {
    assert.equal(strict(t), 'ask', `strict: ${t}`);
    assert.equal(loose(t), 'ask', `longgar: ${t}`);
  }
});

test('regresi: "dulu" dan "tunggu" tidak lagi unclear', () => {
  for (const t of ['dulu', 'tunggu', 'tunggu sebentar', 'baca dulu', 'lihat dulu perubahannya', 'bisa jelasin dulu?']) {
    assert.notEqual(strict(t), 'unclear', t);
    assert.notEqual(strict(t), 'approve', t);
  }
});

test('ask: tool baca (longgar) tetap menerima "baca dulu" sebagai silakan; "aku mau tanya" TIDAK jadi approve walau ada kata "mau"', () => {
  assert.equal(loose('baca dulu'), 'approve');
  assert.equal(loose('aku mau tanya'), 'ask');
  assert.equal(loose('mau tanya'), 'ask');
});

test('"batalkan" tetap tolak; penolakan tegas mengalahkan ask; "belum" + tanya = ask', () => {
  for (const t of ['batalkan', 'batalkan dulu', 'jangan dulu', 'tidak, tanya dulu', 'batal tanya']) {
    assert.equal(strict(t), 'deny', t);
  }
  assert.equal(strict('belum'), 'deny');
  assert.equal(strict('belum, aku mau tanya dulu'), 'ask');
  assert.equal(strict('nanti dulu'), 'ask');
  assert.equal(strict('ya tapi jangan'), 'unclear');
});

test('perilaku lama tidak berubah: setuju tegas, penolakan, ambigu', () => {
  for (const t of ['ya', 'oke', 'lanjut', 'tidak masalah', 'nggak apa apa']) assert.equal(strict(t), 'approve', t);
  for (const t of ['tidak', 'jangan', 'gausah']) assert.equal(strict(t), 'deny', t);
  assert.equal(strict('hmm'), 'unclear');
  assert.equal(strict('apa yang kamu ubah?'), 'unclear');
});

const inquiry = (t, o) => classifyInquiry(t, { strict: true, ...o });

test('mode tanya: ya/tidak yang jelas = keputusan', () => {
  for (const t of ['ya', 'oke lanjut', 'silakan', 'tidak masalah']) assert.equal(inquiry(t), 'approve', t);
  for (const t of ['tidak', 'jangan', 'batalkan', 'gausah']) assert.equal(inquiry(t), 'deny', t);
});

test('mode tanya: selain itu = pertanyaan, dan pertanyaan TIDAK PERNAH jadi persetujuan', () => {
  for (const t of ['kenapa kamu mengubah file itu', 'apakah ini aman, ya?', 'ya, tapi kenapa?', 'oke jelaskan dulu',
    'file apa saja yang berubah', 'berapa baris yang kamu hapus', 'hmm', 'bisa jelasin?', 'ya tapi tunggu dulu',
    'apa yang terjadi kalau aku bilang ya', 'lanjut? tapi apa risikonya', 'mau tanya lagi']) {
    assert.equal(inquiry(t), 'question', t);
    assert.notEqual(inquiry(t, { strict: false }), 'approve', t);
  }
});

test('mode tanya: "batalkan" tetap tolak walau berisi kata tanya; "ya batalkan" bukan tolak otomatis', () => {
  assert.equal(inquiry('batalkan saja, kenapa tadi error?'), 'deny');
  assert.equal(inquiry('batalkan'), 'deny');
  assert.notEqual(inquiry('ya, batalkan?'), 'approve');
});