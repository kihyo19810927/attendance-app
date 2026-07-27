const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    getRecords: () => ipcRenderer.invoke('get-records'),
    clearRecords: () => ipcRenderer.invoke('clear-records'),
    punch: (params) => ipcRenderer.invoke('punch', params),
    manualPunch: (params) => ipcRenderer.invoke('manual-punch', params),
    openExcelFile: () => ipcRenderer.invoke('open-excel-file'),
    openArchiveFolder: () => ipcRenderer.invoke('open-archive-folder'),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window')
});
