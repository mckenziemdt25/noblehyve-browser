// preload-editor.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorAPI', {
    // ============ USAGE TRACKING ============
    getUsageStatus: () => ipcRenderer.invoke('usage:get-status'),
    // ============ LOCAL FILE OPERATIONS ============
    renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', { oldPath, newName }),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    writeFile: (filePath, content) => ipcRenderer.invoke('write-file', { filePath, content }),
    readFile: (filePath) => ipcRenderer.invoke('read-file', { filePath }),
    
    // ============ ENCRYPTED LOCAL FILE OPERATIONS ============
    saveEncryptedFile: (filename, content, password) => 
        ipcRenderer.invoke('save-encrypted-file', { filename, content, password }),
    readEncryptedFile: (filePath, password) => 
        ipcRenderer.invoke('read-encrypted-file', { filePath, password }),
    listEncryptedFiles: () =>
        ipcRenderer.invoke('list-encrypted-files'),
    
    // ============ CLOUD STORAGE ============
    uploadToCloud: (filename, encryptedContent) => 
        ipcRenderer.invoke('editor:cloud-upload', { filename, encryptedContent }),
    downloadFromCloud: (filename) => 
        ipcRenderer.invoke('editor:cloud-download', { filename }),
    listCloudFiles: () => 
        ipcRenderer.invoke('editor:cloud-list'),
    
    // ============ ENCRYPTION HELPERS ============
    encryptContent: (content, password) => 
        ipcRenderer.invoke('crypto:encrypt', { content, password }),
    decryptContent: (encrypted, password) => 
        ipcRenderer.invoke('crypto:decrypt', { encrypted, password }),
    
    // ============ CODE EXECUTION ============
    executeCode: (params) => ipcRenderer.invoke('editor:execute-code', params),
    
    // ============ TERMINAL INTEGRATION (embedded) ============
    sendToTerminal: (code, cwd) => ipcRenderer.invoke('editor:send-to-terminal', { code, cwd }),
    setWorkspace: (dir) => ipcRenderer.invoke('editor:set-workspace', { dir }),
    getWorkspace: () => ipcRenderer.invoke('editor:get-workspace'),
    createTerminalSession: (id, shell, cwd, cols, rows) => 
        ipcRenderer.invoke('terminal:create', { id, shell, cwd, cols, rows }),
    writeToTerminal: (id, data) => ipcRenderer.send('terminal:write', { id, data }),
    resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
    killTerminalSession: (id) => ipcRenderer.send('terminal:kill', { id }),
    onTerminalData: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('terminal:data', handler);
        return () => ipcRenderer.removeListener('terminal:data', handler);
    },
    onTerminalExit: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('terminal:exit', handler);
        return () => ipcRenderer.removeListener('terminal:exit', handler);
    },
    
    // ============ DATA PIPELINE ============
    sendPipelineEvent: (topic, data) => 
        ipcRenderer.invoke('pipeline:event', { topic, data }),
    
    // ============ UI ============
    toggleDevTools: () => ipcRenderer.send('toggle-editor-devtools'),
    openPremiumPage: () => ipcRenderer.send('open-premium-page'),
    
    // ============ DEFAULT BROWSER ============
    setAsDefaultBrowser: () => ipcRenderer.invoke('set-default-browser'),
    isDefaultBrowser: () => ipcRenderer.invoke('is-default-browser')
});
