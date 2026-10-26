const Module = require('module');
const orig = Module._load;
const stub = () => new Proxy(function () {}, { get: () => stub(), apply: () => stub() });
Module._load = function (request, ...rest) {
  if (request === 'electron') return {};
  try {
    return orig.call(this, request, ...rest);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && !request.startsWith('.') && !request.startsWith('/')) return stub();
    throw err;
  }
};
