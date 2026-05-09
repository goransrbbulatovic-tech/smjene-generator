const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  minimize:         () => ipcRenderer.send('win-minimize'),
  maximize:         () => ipcRenderer.send('win-maximize'),
  close:            () => ipcRenderer.send('win-close'),
  openExcel:        () => ipcRenderer.invoke('open-excel'),
  refreshExcel:     (fp) => ipcRenderer.invoke('refresh-excel', fp),
  saveExcel:        (o) => ipcRenderer.invoke('save-excel', o),
  openImage:        () => ipcRenderer.invoke('open-image'),
  exportPdf:        (o) => ipcRenderer.invoke('export-pdf', o),
  persistData:      (d) => ipcRenderer.invoke('persist-data', d),
  getPersistedData: () => ipcRenderer.invoke('get-persisted-data'),
  backupExport:     () => ipcRenderer.invoke('backup-export'),
  backupImport:     () => ipcRenderer.invoke('backup-import'),
  sendNotification: (o) => ipcRenderer.invoke('send-notification', o),
  on: (ch, fn) => {
    const ok = ['prepare-print','print-done','app-version','load-persisted-data'];
    if (ok.includes(ch)) ipcRenderer.on(ch, (_, ...a) => fn(...a));
  }
});
