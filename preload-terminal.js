// preload-terminal.js - Complete version
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('terminalAPI', {
    // PTY methods
    createSession: (id, shell, cwd, cols, rows) => ipcRenderer.invoke('terminal:create', { id, shell, cwd, cols, rows }),
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
    onCwdChanged: (callback) => {
        ipcRenderer.on('terminal:cwd-changed', (event, data) => callback(data));
        return () => ipcRenderer.removeAllListeners('terminal:cwd-changed');
    },
    
    // Utility methods
    getCwd: (id) => ipcRenderer.invoke('terminal:get-cwd', id),
    getSystemInfo: () => ipcRenderer.invoke('terminal:system-info'),
    download: (url, filename, cwd) => ipcRenderer.invoke('terminal:download', { url, filename, cwd })
});