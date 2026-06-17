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
    
    // ============ TERMINAL INTEGRATION ============
    sendToTerminal: (code, cwd) => ipcRenderer.invoke('editor:send-to-terminal', { code, cwd }),
    setWorkspace: (dir) => ipcRenderer.invoke('editor:set-workspace', { dir }),
    getWorkspace: () => ipcRenderer.invoke('editor:get-workspace'),
    
    // ============ UI ============
    toggleDevTools: () => ipcRenderer.send('toggle-editor-devtools')
});