const workspace = require('../workspace/workspace');
const { planPatch, describePlan, LIMITS } = require('../patch/patch-plan');
const { applyOperations } = require('../patch/patch-apply');
const clean = (s, n) => workspace.clean(s, n);
const applyPatch = {
  name: 'apply_patch',
  description:
    'Mengubah folder proyek aktif lewat SATU patch berisi daftar operasi JSON. Ini satu-satunya cara ' +
    'menulis ke proyek. Operasi: {"op":"edit","path","oldText","newText","replaceAll"?} (oldText persis ' +
    'dari file yang SUDAH kamu baca, unik), {"op":"create","path","content"} (file baru), ' +
    '{"op":"delete","path"}, {"op":"rename","from","to"}. Batas per patch: ' +
    `${LIMITS.MAX_OPERATIONS} operasi, ${LIMITS.MAX_FILES} file (rename menghitung dua), ` +
    `${LIMITS.MAX_LINES} baris (tambah+hapus; satu baris diganti dihitung 2). Semua operasi diperiksa ` +
    'dulu; kalau satu gagal, tidak ada yang ditulis. Menghapus/mengganti nama file atau menyentuh ' +
    'package.json/lockfile tergolong merusak dan selalu butuh izin pengguna. Pecah pekerjaan besar ' +
    'menjadi patch bertahap yang kecil.',
  params: {
    operations: {
      type: 'string', required: true, raw: true,
      description: 'Array JSON berisi operasi, mis. [{"op":"edit","path":"src/a.js","oldText":"x = 1","newText":"x = 2"}]',
    },
  },
  permission: 'confirm',
  alwaysConfirm: true,      
  untrusted: false,
  coding: true,
  planGated: true,          
  describe: (args) => {
    const r = planPatch(args.operations);
    if (!r.ok) return 'Boleh aku menerapkan patch ke proyek?';
    const plan = r.plan;
    const names = plan.writes.slice(0, 4).map((w) => clean(w.rel, 60)).join(', ');
    const more = plan.writes.length > 4 ? `, dan ${plan.writes.length - 4} lainnya` : '';
    const warn = plan.kind === 'destructive'
      ? `PERHATIAN, patch ini bersifat merusak (${plan.reasons.slice(0, 3).map((x) => clean(x, 80)).join('; ')}). `
      : '';
    return `${warn}Boleh aku menerapkan patch: ${describePlan(plan)}? Berkas: ${names}${more}.`;
  },
  validate: (args) => {
    const r = planPatch(args.operations);
    return r.ok ? null : r.error;
  },
  digestOf: (args) => {
    const r = planPatch(args.operations);
    return r.ok ? r.plan.digest : null;
  },
  planOf: (args) => planPatch(args.operations),
  execute: async (args, ctx = {}) => applyOperations(args.operations, { approvedDigest: ctx.approvedDigest }),
};

module.exports = applyPatch;
