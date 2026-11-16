'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('yomikata', {
  appInfo: () => ipcRenderer.invoke('app:info'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  setKey: (key) => ipcRenderer.invoke('secret:set', key),
  clearKey: () => ipcRenderer.invoke('secret:clear'),
  testConnection: (payload) => ipcRenderer.invoke('secret:test', payload),

  openEpub: () => ipcRenderer.invoke('book:open'),
  readEpub: (filePath) => ipcRenderer.invoke('book:read', filePath),
  pendingEpub: () => ipcRenderer.invoke('book:pending'),
  onOpenRequest: (callback) => {
    ipcRenderer.on('book:open-request', (_event, filePath) => callback(filePath));
  },
  pathForFile: (file) => webUtils.getPathForFile(file),

  lookup: (payload) => ipcRenderer.invoke('lookup:selection', payload),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  exportCsv: (payload) => ipcRenderer.invoke('export:csv', payload),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url)
});
