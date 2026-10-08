const openBrowser = require('./open-browser');
const screenshotTool = require('./screenshot');
const findFiles      = require('./find-files');
const readPdf        = require('./read-pdf');
const viewScreenshot = require('./view-screenshot');
const pdfPickAndRead = require('./pdf-pick-and-read');

const TOOLS = {
  [openBrowser.name]: openBrowser,
  [screenshotTool.name]: screenshotTool,
  [findFiles.name]: findFiles,
  [viewScreenshot.name]: viewScreenshot,
  [pdfPickAndRead.name]: pdfPickAndRead,
  [readPdf.name]: readPdf,
};

function getTool(name) {
  return TOOLS[name] ?? null;
}

function listTools() {
  return Object.values(TOOLS);
}

function buildToolPromptSection() {
  return listTools()
    .map((t) => {
      const params = Object.entries(t.params || {})
        .map(([k, v]) => `${k}:${v.type}${v.required ? '' : '?'}`)
        .join(', ');
      return `  [tool:${t.name}|<${params}>] → ${t.description}`;
    })
    .join('\n');
}

function parseArgs(tool, rawArgs) {
  const keys = Object.keys(tool.params || {});
  if (keys.length === 0) return {};
  if (keys.length === 1) return { [keys[0]]: rawArgs.trim() };

  const parts = rawArgs.split('|');
  const args = {};
  keys.forEach((k, i) => {
    args[k] = (parts[i] ?? '').trim();
  });
  return args;
}

async function executeTool(name, rawArgs) {
  const tool = getTool(name);
  if (!tool) {
    console.warn('[TOOL] Tidak dikenal:', name);
    return { success: false, error: `Tool "${name}" tidak dikenal` };
  }

  const args = parseArgs(tool, rawArgs);
  console.log('[TOOL] Menjalankan:', name, args);

  try {
    const result = await tool.execute(args);
    console.log('[TOOL] Hasil:', result);
    return result;
  } catch (err) {
    console.error('[TOOL] Error:', err);
    return { success: false, error: err.message };
  }
}

async function executeToolActions(actions) {
  const toolActions = actions.filter((a) => a.name === 'execute_tool');
  const results = [];
  for (const ta of toolActions) {
    results.push(await executeTool(ta.args.tool, ta.args.rawArgs));
  }
  return results;
}

module.exports = {
  TOOLS,
  getTool,
  listTools,
  buildToolPromptSection,
  executeTool,
  executeToolActions,
};