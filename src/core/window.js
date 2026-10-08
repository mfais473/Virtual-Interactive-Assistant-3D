const { BrowserWindow } = require('electron');
const path = require('path');

let mainWindow = null;

const RESIZE_MIN = 300;
const RESIZE_MAX = 1600;
const RESIZE_STEP = 1.08;

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 900,
    transparent: true,
    frame: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;
  win.loadFile('index.html');
  win.webContents.openDevTools({ mode: 'detach' });
  return win;
}

function resizeWindow(direction) {
  if (!mainWindow) return;

  const bounds = mainWindow.getBounds();
  const factor = direction === 'in' ? RESIZE_STEP : 1 / RESIZE_STEP;

  let newWidth = Math.round(bounds.width * factor);
  let newHeight = Math.round(bounds.height * factor);
  newWidth = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, newWidth));
  newHeight = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, newHeight));

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  mainWindow.setBounds({
    x: Math.round(centerX - newWidth / 2),
    y: Math.round(centerY - newHeight / 2),
    width: newWidth,
    height: newHeight,
  });
}

function getMainWindow() {
  return mainWindow;
}

module.exports = { createWindow, resizeWindow, getMainWindow };