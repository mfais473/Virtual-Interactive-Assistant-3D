// Registry tool + skema function calling native + kebijakan izin.
// Satu jalur tulis ke proyek: apply_patch. project-edit-file.js / project-write-file.js masih ada
// sebagai modul, tetapi TIDAK didaftarkan di sini (model tidak bisa memanggilnya).
const openBrowser = require('./open-browser');
const findFiles = require('./find-files');
const screenshot = require('./screenshot');
const viewScreenshot = require('./view-screenshot');
const readPdf = require('./read-pdf');
const pdfPickAndRead = require('./pdf-pick-and-read');
const imagePickAndView = require('./image-pick-and-view');
const createExcel = require('./create-excel');
const readExcel = require('./read-excel');
const projectPickFolder = require('./project-pick-folder');
const projectList = require('./project-list');
const projectReadFile = require('./project-read-file');
const projectReadLog = require('./project-read-log');
const applyPatch = require('./apply-patch');
const projectProposePlan = require('./project-propose-plan');
const { REASON_KEY, REASON_DESCRIPTION } = require('./reason');
const TOOLS = {
  [openBrowser.name]: openBrowser,
  [findFiles.name]: findFiles,
  [screenshot.name]: screenshot,
  [viewScreenshot.name]: viewScreenshot,
  [readPdf.name]: readPdf,
  [pdfPickAndRead.name]: pdfPickAndRead,
  [imagePickAndView.name]: imagePickAndView,
  [createExcel.name]: createExcel,
  [readExcel.name]: readExcel,
  [projectPickFolder.name]: projectPickFolder,
  [projectList.name]: projectList,
  [projectReadFile.name]: projectReadFile,
  [projectReadLog.name]: projectReadLog,
  [applyPatch.name]: applyPatch,
  [projectProposePlan.name]: projectProposePlan,
};
const TOOL_TIMEOUT_MS = 120000;

function getTool(name) {
  return Object.prototype.hasOwnProperty.call(TOOLS, name) ? TOOLS[name] : null;
}

function getToolSchemas() {
  return Object.values(TOOLS).map((t) => {
    const properties = {};
    const required = [];
    for (const [k, v] of Object.entries(t.params || {})) {
      properties[k] = { type: v.type || 'string', description: v.description || '' };
      if (v.required) required.push(k);
    }
    properties[REASON_KEY] = { type: 'string', description: REASON_DESCRIPTION };
    required.push(REASON_KEY);
    return {
      name: t.name,
      description: t.description,
      parameters: { type: 'object', properties, required },
    };
  });
}

function permissionOf(tool) {
  if (tool.alwaysConfirm) return 'confirm';
  const overrides = (process.env.VIA_AUTO_TOOLS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (overrides.includes(tool.name)) return 'auto';
  return tool.permission === 'auto' ? 'auto' : 'confirm';
}

function normalizeArgs(tool, rawArgs) {
  const params = tool.params || {};
  const input = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const args = {};
  for (const [k, spec] of Object.entries(params)) {
    const v = input[k];
    const missing = v === undefined || v === null;
    const blank = !missing && String(v).trim() === '';
    if (missing || (blank && !spec.allowEmpty)) {
      if (spec.required) return { error: `Argumen wajib "${k}" tidak ada` };
      continue;
    }
    const str = typeof v === 'object' ? JSON.stringify(v) : String(v);
    args[k] = spec.raw ? str : str.trim();
  }
  return { args };
}

function describeCall(tool, args) {
  try {
    return tool.describe ? tool.describe(args) : `Boleh aku menjalankan ${tool.name}?`;
  } catch {
    return `Boleh aku menjalankan ${tool.name}?`;
  }
}

async function validateCall(tool, args) {
  if (typeof tool.validate !== 'function') return null;
  try {
    return (await tool.validate(args)) || null;
  } catch (err) {
    return err.message || 'Validasi gagal';
  }
}

function digestOf(tool, args) {
  try {
    return typeof tool.digestOf === 'function' ? tool.digestOf(args) : null;
  } catch {
    return null;
  }
}

async function executeTool(name, args, ctx = {}) {
  const tool = getTool(name);
  if (!tool) return { success: false, error: `Tool "${name}" tidak dikenal` };
  let timer;
  try {
    return await Promise.race([
      tool.execute(args, ctx),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error('Tool melebihi batas waktu')), TOOL_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  getTool, getToolSchemas, permissionOf, normalizeArgs, describeCall, validateCall, digestOf, executeTool,
};
