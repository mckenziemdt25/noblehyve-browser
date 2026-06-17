// preload-terminal.js - Complete version
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('terminalAPI', {
    // PTY methods
    createSession: (id, shell, cwd) => ipcRenderer.invoke('terminal:create', { id, shell, cwd }),
    write: (id, data) => ipcRenderer.send('terminal:write', { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
    kill: (id) => ipcRenderer.send('terminal:kill', { id }),
    
    // Event handlers
    onData: (callback) => {
        ipcRenderer.on('terminal:data', (event, data) => callback(data));
        return () => ipcRenderer.removeAllListeners('terminal:data');
    },
    onExit: (callback) => {
        ipcRenderer.on('terminal:exit', (event, data) => callback(data));
        return () => ipcRenderer.removeAllListeners('terminal:exit');
    },
    onError: (callback) => {
        ipcRenderer.on('terminal:error', (event, error) => callback(error));
        return () => ipcRenderer.removeAllListeners('terminal:error');
    },
    
    // Utility methods
    getCwd: () => ipcRenderer.invoke('terminal:get-cwd'),
    getSystemInfo: () => ipcRenderer.invoke('terminal:system-info'),
    download: (url, filename, cwd) => ipcRenderer.invoke('terminal:download', { url, filename, cwd })
});