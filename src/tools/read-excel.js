const path = require('path');
const fs = require('fs/promises');
const { isInsideAllowed } = require('./path-guard');
const { getLatest } = require('./session-artifacts');
const MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_ROWS = 50;
const MAX_ROWS_PER_CALL = 200;
const MAX_COLS = 50;            
const MAX_CELL_CHARS = 200;
const TEXT_BUDGET = 12000;      

function toInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function isoDate(d) {
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.replace('.000Z', 'Z');
}

function normalizeCell(v) {
  if (v === null || v === undefined) return { value: null, formula: false };
  if (v instanceof Date) return { value: isoDate(v), formula: false };
  if (typeof v === 'number') return { value: Number.isFinite(v) ? v : null, formula: false };
  if (typeof v === 'boolean') return { value: v, formula: false };
  if (typeof v === 'string') return { value: v, formula: false };

  if (typeof v === 'object') {
    if (v.formula !== undefined || v.sharedFormula !== undefined) {
      return { value: normalizeCell(v.result).value, formula: true };
    }
    if (Array.isArray(v.richText)) {
      return { value: v.richText.map((p) => (p && p.text) || '').join(''), formula: false };
    }
    if (v.hyperlink !== undefined) {
      return { value: normalizeCell(v.text !== undefined ? v.text : v.hyperlink).value, formula: false };
    }
    if (v.error !== undefined) return { value: String(v.error), formula: false };
    if (v.text !== undefined) return { value: String(v.text), formula: false };
    try {
      return { value: JSON.stringify(v), formula: false };
    } catch {
      return { value: null, formula: false };
    }
  }
  return { value: String(v), formula: false };
}

/**
 * Ambil irisan sheet sebagai array of array. `ws` cukup berupa objek dengan
 * rowCount, columnCount, dan getRow(n).getCell(c).value (bentuk worksheet ExcelJS).
 */
function sliceSheet(ws, { startRow = 1, maxRows = DEFAULT_ROWS } = {}) {
  const totalRows = ws.rowCount || 0;
  const totalCols = ws.columnCount || 0;
  const cols = Math.min(totalCols, MAX_COLS);
  const last = Math.min(totalRows, startRow + maxRows - 1);
  const rows = [];
  let formulaCells = 0;
  let trimmedCells = 0;
  let chars = 0;

  for (let r = startRow; r <= last; r++) {
    const row = ws.getRow(r);
    const out = [];
    for (let c = 1; c <= cols; c++) {
      const n = normalizeCell(row.getCell(c).value);
      let value = n.value;
      if (typeof value === 'string' && value.length > MAX_CELL_CHARS) {
        value = value.slice(0, MAX_CELL_CHARS);
        trimmedCells += 1;
      }
      if (n.formula) formulaCells += 1;
      out.push(value);
    }
    while (out.length && out[out.length - 1] === null) out.pop();   

    const size = JSON.stringify(out).length;
    if (rows.length && chars + size > TEXT_BUDGET) break;         
    rows.push(out);
    chars += size;
  }

  const endRow = startRow + rows.length - 1;
  const hasMoreRows = rows.length > 0 ? endRow < totalRows : false;
  const complete =
    startRow === 1 && !hasMoreRows && totalCols <= MAX_COLS && trimmedCells === 0;

  return {
    rows,
    totalRows,
    totalCols,
    formulaCells,
    trimmedCells,
    colsTruncated: totalCols > MAX_COLS,
    nextStartRow: hasMoreRows ? endRow + 1 : null,
    complete,
  };
}

function headerOf(ws) {
  const cols = Math.min(ws.columnCount || 0, MAX_COLS);
  if (!ws.rowCount || !cols) return [];
  const row = ws.getRow(1);
  const out = [];
  for (let c = 1; c <= cols; c++) {
    const v = normalizeCell(row.getCell(c).value).value;
    out.push(v === null ? '' : String(v).slice(0, 40));
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

const readExcel = {
  name: 'read_excel',
  description:
    'Membaca isi file Excel (.xlsx) dan mengembalikan baris-barisnya sebagai JSON array of array ' +
    '(format yang sama dengan parameter "rows" di create_excel). Pakai saat pengguna ingin membahas, ' +
    'memeriksa, atau mengubah file Excel. Kalau pengguna menyebut "Excel tadi"/"file itu", kosongkan ' +
    '"path": aplikasi memakai file Excel terbaru di sesi ini. File besar dibaca per halaman ' +
    '(startRow/maxRows); cek "complete" dan "nextStartRow" di hasilnya.',
  params: {
    path: { type: 'string', required: false, description: 'Path lengkap file .xlsx (kosongkan untuk Excel terbaru di sesi ini)' },
    sheetName: { type: 'string', required: false, description: 'Nama sheet (default: sheet pertama)' },
    startRow: { type: 'string', required: false, description: 'Baris awal, mulai dari 1 (default 1)' },
    maxRows: { type: 'string', required: false, description: `Jumlah baris maksimal (default ${DEFAULT_ROWS}, maks ${MAX_ROWS_PER_CALL})` },
  },
  permission: 'confirm',   
  untrusted: true,         
  describe: ({ path: p }) =>
    `Boleh aku baca isi file Excel ${p ? path.basename(p) : 'tadi'}? Isinya akan dikirim ke layanan AI.`,
  execute: async ({ path: filePath, sheetName, startRow, maxRows }) => {
    let target = filePath;
    if (!target) {
      const latest = getLatest('excel');
      if (!latest) return { success: false, error: 'Path kosong dan belum ada file Excel di sesi ini' };
      target = latest.path;
    }
    if (!target.toLowerCase().endsWith('.xlsx')) {
      return { success: false, error: 'Hanya file .xlsx yang didukung' };
    }
    if (!isInsideAllowed(target)) {
      return { success: false, error: 'File di luar area yang diizinkan' };
    }
    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) return { success: false, error: 'Path bukan file' };
      if (stat.size > MAX_BYTES) return { success: false, error: 'File Excel terlalu besar (maks 20 MB)' };
      const ExcelJS = require('exceljs');   // dimuat saat dipakai supaya modul ini ringan dimuat/diuji
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(target);
      const names = wb.worksheets.map((w) => w.name);
      if (!names.length) return { success: false, error: 'File Excel tidak punya sheet' };
      const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
      if (!ws) {
        return { success: false, error: `Sheet "${sheetName}" tidak ada. Sheet yang tersedia: ${names.join(', ')}` };
      }
      const start = toInt(startRow, 1, 1, 1000000);
      const limit = toInt(maxRows, DEFAULT_ROWS, 1, MAX_ROWS_PER_CALL);
      const slice = sliceSheet(ws, { startRow: start, maxRows: limit });
      const result = {
        success: true,
        path: target,
        sheet: ws.name,
        sheets: names,
        totalRows: slice.totalRows,
        totalCols: slice.totalCols,
        columns: headerOf(ws),
        startRow: start,
        returnedRows: slice.rows.length,
        nextStartRow: slice.nextStartRow,
        formulaCells: slice.formulaCells,
        complete: slice.complete,
        text: JSON.stringify(slice.rows),
      };
      if (!slice.complete) {
        const reasons = [];
        if (start > 1) reasons.push('dibaca mulai di tengah sheet');
        if (slice.nextStartRow) reasons.push('masih ada baris berikutnya');
        if (slice.colsTruncated) reasons.push(`kolom dipotong di ${MAX_COLS}`);
        if (slice.trimmedCells) reasons.push(`${slice.trimmedCells} sel teks dipotong`);
        result.note =
          `Data BELUM lengkap (${reasons.join('; ') || 'sebagian'}). ` +
          'Jangan membuat ulang file dari data ini.';
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  toArtifact: (args, result) => ({
    type: 'excel',
    path: result.path,
    sheet: result.sheet,
    rows: result.totalRows,
    cols: result.totalCols,
    columns: result.columns,
  }),
};

module.exports = readExcel;
module.exports.__test = { normalizeCell, sliceSheet, headerOf, MAX_COLS, TEXT_BUDGET, MAX_CELL_CHARS };