const fs = require('fs');
const os = require('os');
const path = require('path');

function safeReal(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    const parent = path.dirname(p);
    if (parent === p) return p;
    return path.join(safeReal(parent), path.basename(p));
  }
}

function allowedRoots() {
  const raw = process.env.VIA_ALLOWED_DIRS;
  const roots = raw
    ? raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    : [os.homedir()];
  return roots.map((r) => safeReal(path.resolve(r)));
}

function isInsideAllowed(target) {
  if (!target || typeof target !== 'string') return false;
  const resolved = safeReal(path.resolve(target));
  return allowedRoots().some((root) => {
    const rel = path.relative(root, resolved);
    if (rel === '') return true;
    return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
  });
}

function resolveUserPath(p) {
  const home = os.homedir();
  const s = String(p || '').trim();
  if (s === '~') return home;
  if (/^~[\\/]/.test(s)) return path.join(home, s.slice(2));
  return path.isAbsolute(s) ? path.resolve(s) : path.resolve(home, s);
}

function defaultSaveDir() {
  const docs = path.join(os.homedir(), 'Documents');
  return isInsideAllowed(docs) ? docs : allowedRoots()[0];
}

module.exports = { isInsideAllowed, allowedRoots, resolveUserPath, defaultSaveDir };