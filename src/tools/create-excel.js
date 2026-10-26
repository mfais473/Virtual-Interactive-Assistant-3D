const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const ExcelJS = require('exceljs');
const { isInsideAllowed, allowedRoots, resolveUserPath, defaultSaveDir } = require('./path-guard');
const MAX_ROWS = 5000;
const MAX_COLS = 50;

function toCell(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v;
  return String(v);
}

function parseRows(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: 'Argumen "rows" bukan JSON yang valid. Kirim array of array, mis. [["Nama","Umur"],["Budi",20]]' };
  }
  if (!Array.isArray(data) || !data.length || !data.every(Array.isArray)) {
    return { error: 'Argumen "rows" harus array of array (baris pertama = header)' };
  }
  if (data.length > MAX_ROWS) return { error: `Terlalu banyak baris (maks ${MAX_ROWS})` };
  if (data.some((r) => r.length > MAX_COLS)) return { error: `Terlalu banyak kolom (maks ${MAX_COLS})` };
  return { data };
}

function safeName(name) {
  const base = path.basename(String(name || '')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return base || `data-${Date.now()}.xlsx`;
}

async function uniquePath(p) {
  const { dir, name, ext } = path.parse(p);
  let candidate = p;
  for (let i = 1; i < 1000; i++) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${name}-${i}${ext}`);
    } catch {
      return candidate;
    }
  }
  return null;
}

const createExcel = {
  name: 'create_excel',
  description:
    'Membuat file Excel (.xlsx) baru dari data tabel. Pakai saat pengguna minta data ' +
    '(mis. hasil membaca gambar/PDF) dijadikan Excel/spreadsheet. Baris pertama = header. ' +
    'Jangan mengarang angka yang tidak terbaca jelas; kosongkan sel itu atau beri tahu pengguna.',
  params: {
    fileName: { type: 'string', required: true, description: 'Nama file, mis. nilai-siswa.xlsx' },
    rows: {
      type: 'string',
      required: true,
      description:
        'JSON array of array. Baris pertama header. Angka tulis sebagai angka (bukan string). ' +
        'Contoh: [["Nama","Nilai"],["Budi",85],["Sari",90]]',
    },
    sheetName: { type: 'string', required: false, description: 'Nama sheet (default: Sheet1)' },
    folder: { type: 'string', required: false, description: 'Folder simpan (default: Documents)' },
  },
  permission: 'confirm',  
  untrusted: false,
  describe: ({ fileName, rows }) => {
    let n = '';
    try { n = ` dengan ${JSON.parse(rows).length} baris`; } catch { /* abaikan */ }
    return `Boleh aku buat file Excel ${fileName ? safeName(fileName) : 'baru'}${n}?`;
  },
  toArtifact: (args, result) => {
    const parsed = parseRows(args.rows);
    const data = parsed.data || [];
    return {
      type: 'excel',
      path: result.path,
      rows: result.rows,
      cols: data.reduce((m, r) => Math.max(m, r.length), 0),
      columns: data[0] ? data[0].map((c) => (c === null || c === undefined ? '' : String(c))) : [],
    };
  },
  execute: async ({ fileName, rows, sheetName, folder }) => {
    const parsed = parseRows(rows);
    if (parsed.error) return { success: false, error: parsed.error };
    let name = safeName(fileName);
    if (!name.toLowerCase().endsWith('.xlsx')) name += '.xlsx';
    const dir = folder ? resolveUserPath(folder) : defaultSaveDir();
    if (!isInsideAllowed(dir)) {
      return { success: false, error: `Folder di luar area yang diizinkan. Folder yang diizinkan: ${allowedRoots().join(' ; ')}` };
    }
    try {
      await fs.mkdir(dir, { recursive: true });
      const outPath = await uniquePath(path.join(dir, name));
      if (!outPath) return { success: false, error: 'Tidak bisa menentukan nama file unik' };
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(String(sheetName || 'Sheet1').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
      for (const r of parsed.data) ws.addRow(r.map(toCell));
      const header = ws.getRow(1);
      header.font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.columns.forEach((col) => {
        let max = 8;
        col.eachCell({ includeEmpty: false }, (c) => {
          max = Math.max(max, Math.min(String(c.value ?? '').length + 2, 60));
        });
        col.width = max;
      });
      await wb.xlsx.writeFile(outPath);
      return {
        success: true,
        path: outPath,
        rows: parsed.data.length,
        message: `File Excel disimpan di ${outPath}`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

module.exports = createExcel;