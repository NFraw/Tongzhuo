const { contextBridge, ipcRenderer } = require('electron')

// Expose minimal API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  isDesktop: true,
  getVersion: () => ipcRenderer.invoke('app:version'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
})
