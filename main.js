const { app, BrowserWindow, session } = require('electron');

const { createWindow } = require('./src/core/window');
const { registerIpcHandlers } = require('./src/core/ipc-handlers');

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});