const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onUpdate: (callback) => {
        ipcRenderer.on('update-popup', (event, data) => callback(data));
    },
    cancelDownload: (id) => ipcRenderer.send('popup-cancel-download', id),
    openFile: (path) => ipcRenderer.send('popup-open-file', path),
    viewAll: () => ipcRenderer.send('popup-view-all'),
    clearAll: () => ipcRenderer.send('popup-clear-all'),
    close: () => ipcRenderer.send('popup-close'),
});
