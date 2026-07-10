const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    signup: (email, password) => ipcRenderer.invoke('auth:signup', { email, password }),
    login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getAuthUser: () => ipcRenderer.invoke('auth:get-user'),
    resendConfirmation: (email) => ipcRenderer.invoke('auth:resend-confirmation', { email }),
    checkConfirmation: () => ipcRenderer.invoke('auth:check-confirmation'),
    on: (channel, callback) => {
        ipcRenderer.on(channel, callback);
        return () => ipcRenderer.removeListener(channel, callback);
    },
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    send: (channel, data) => ipcRenderer.send(channel, data)
});
