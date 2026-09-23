const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

  processTurn: (audioBase64, mimeType) =>
    ipcRenderer.invoke('process-turn', { audioBase64, mimeType }),

  quitApp: () => ipcRenderer.send('app-quit'),

  resizeWindow: (direction) => ipcRenderer.send('resize-window', direction),
});
