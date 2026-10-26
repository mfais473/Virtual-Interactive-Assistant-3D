const workspace = require('../workspace/workspace');
const gate = require('../agent/plan-gate');
const clean = (s, n) => workspace.clean(s, n);
const OP_LABEL = { edit: 'ubah', create: 'baru', delete: 'hapus', rename: 'ganti nama', 'rename-from': 'ganti nama', 'rename-to': 'tujuan ganti nama' };
const projectProposePlan = {
  name: 'project_propose_plan',
  description:
    'WAJIB dipanggil SEBELUM apply_patch pertama pada pekerjaan yang mengubah proyek. Mengajukan rencana ' +
    'terstruktur untuk disetujui pengguna: {"ringkasan":"satu kalimat","files":[' +
    '{"path":"src/a.js","op":"edit"},{"path":"src/b.js","op":"create"},{"path":"x.js","op":"rename","to":"y.js"},' +
    '{"path":"z.js","op":"delete"}]}. Daftar SEMUA file yang akan kamu sentuh beserta jenis operasinya. ' +
    'Anggaran baris dihitung OTOMATIS oleh sistem dari jumlah file — kamu TIDAK perlu mengisinya. ' +
    'Setelah disetujui, patch aditif di dalam rencana berjalan tanpa tanya lagi; menyentuh file lain, ' +
    'operasi lain, atau berubah menjadi merusak akan MENGHENTIKAN pekerjaan. Rencana berlaku 10 menit. ' +
    'Baca file yang relevan dulu.',
  params: {
    rencana: { type: 'string', required: true, raw: true, description: 'Objek JSON rencana (ringkasan, files)' },
  },
  permission: 'confirm',
  alwaysConfirm: true,
  untrusted: false,
  coding: true,
  describe: ({ rencana }) => {
    const r = gate.buildManifest(rencana);
    if (!r.ok) return 'Boleh aku mengajukan rencana perubahan untuk proyek ini?';
    const m = r.manifest;
    const files = m.files.slice(0, 5).map((f) => `${clean(f.path, 50)} (${f.ops.map((o) => OP_LABEL[o] || o).join('/')})`).join(', ');
    const more = m.files.length > 5 ? `, dan ${m.files.length - 5} lainnya` : '';
    const warn = m.kind === 'destructive' ? 'PERHATIAN, rencana ini mencakup hapus, ganti nama, atau berkas dependensi. ' : '';
    return (
      `${warn}Boleh aku mengajukan rencana: ${m.summary}. Menyentuh ${m.files.length} file: ${files}${more}. ` +
      `Patch aditif di dalam rencana akan langsung kujalankan, dan kalau menyimpang aku berhenti.`
    );
  },
  validate: ({ rencana }) => {
    const r = gate.buildManifest(rencana);
    return r.ok ? null : r.error;
  },
  digestOf: ({ rencana }) => {
    const r = gate.buildManifest(rencana);
    return r.ok ? r.digest : null;
  },
  execute: async ({ rencana }, ctx = {}) => {
    const r = gate.buildManifest(rencana);
    if (!r.ok) return { success: false, error: r.error };
    if (!ctx.approvedDigest) return { success: false, code: 'NO_DIGEST', error: 'Persetujuan tidak terikat digest; rencana tidak diaktifkan' };
    if (ctx.approvedDigest !== r.digest) {
      return { success: false, code: 'DIGEST_MISMATCH', error: 'Rencana berubah sejak disetujui (digest tidak cocok); tidak diaktifkan' };
    }
    const { expiresAt } = gate.activate(r.manifest, r.digest);
    return {
      success: true,
      digest: r.digest,
      kind: r.manifest.kind,
      files: r.manifest.files.length,
      expiresInMinutes: Math.round((expiresAt - Date.now()) / 60000),
      message:
        'Rencana disetujui. Kerjakan HANYA file dan operasi di rencana, dalam patch kecil bertahap. ' +
        'Patch aditif di dalam rencana langsung berjalan; yang menyimpang menghentikan pekerjaan.',
    };
  },
};

module.exports = projectProposePlan;