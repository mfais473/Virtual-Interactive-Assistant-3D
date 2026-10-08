let lastScreenshotPath = null;

function setLastScreenshotPath(p) { lastScreenshotPath = p; }
function getLastScreenshotPath()   { return lastScreenshotPath; }

module.exports = { setLastScreenshotPath, getLastScreenshotPath };