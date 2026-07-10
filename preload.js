// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Browser navigation
    newBrowserTab: (id, url) => ipcRenderer.send('new-browser-tab', { id, url }),
    newPrivateTab: (id, url) => ipcRenderer.send('new-private-tab', { id, url }),
    closeBrowserTab: (id) => ipcRenderer.send('close-browser-tab', id),
    navigate: (url) => ipcRenderer.send('navigate', url),
    back: () => ipcRenderer.send('back'),
    forward: () => ipcRenderer.send('forward'),
    refresh: () => ipcRenderer.send('refresh'),
    print: () => ipcRenderer.send('print-page'),
    setZoom: (level) => ipcRenderer.send('set-zoom', level),
    findInPage: (text) => ipcRenderer.send('find-in-page', text),
    stopFindInPage: () => ipcRenderer.send('stop-find-in-page'),
    toggleCurrentDevtools: () => ipcRenderer.send('toggle-current-devtools'),
    
    // Window management
    openEditor: () => ipcRenderer.send('open-editor'),
    openTerminal: () => ipcRenderer.send('open-terminal'),
    showMoreMenu: () => ipcRenderer.send('show-more-menu'),
    showDownloadPopup: (downloads) => ipcRenderer.send('show-download-popup', downloads),
    hideDownloadPopup: () => ipcRenderer.send('hide-download-popup'),
    updateDownloadPopupState: (downloads) => ipcRenderer.send('update-download-popup-state', downloads),
    
    // Browser management
    showBrowser: (id) => ipcRenderer.send('show-browser', id),
    hideBrowser: () => ipcRenderer.send('hide-browser'),
    saveSession: (tabs) => ipcRenderer.send('save-session', tabs),

    // Add to contextBridge.exposeInMainWorld in preload.js

// Cloud storage methods
saveCloudCredentials: (accountId, accessKey, secretKey) => 
    ipcRenderer.invoke('cloud:save-creds', { accountId, accessKey, secretKey }),
testCloudConnection: () => 
    ipcRenderer.invoke('cloud:test-connection'),
getCloudStatus: () => 
    ipcRenderer.invoke('cloud:get-status'),
clearCloudCredentials: () => 
    ipcRenderer.invoke('cloud:clear-creds'),
listCloudFiles: () => 
    ipcRenderer.invoke('cloud:list-files'),
    
    // Security
    checkPasswordBreach: (password) => ipcRenderer.send('check-password-breach', password),
    scanPage: () => ipcRenderer.send('scan-page'),
    clearBrowserData: () => ipcRenderer.send('clear-browser-data'),
    openDownloadsFolder: () => ipcRenderer.send('open-downloads-folder'),
    cancelDownload: (id) => ipcRenderer.send('cancel-download', id),
    openDownloadFile: (filePath) => ipcRenderer.send('open-download-file', filePath),
    
    // Typo response
    typoResponse: (response) => ipcRenderer.send('typo-response', response),

    // Premium license methods
    getLicenseStatus: () => ipcRenderer.invoke('license:get-status'),
    activateLicense: (key) => ipcRenderer.invoke('license:activate', key),
    deactivateLicense: () => ipcRenderer.invoke('license:deactivate'),
    openPremiumPage: () => ipcRenderer.send('open-premium-page'),
    getUsageStatus: () => ipcRenderer.invoke('usage:get-status'),

    // Data pipeline
    sendPipelineEvent: (topic, data) => ipcRenderer.invoke('pipeline:event', { topic, data }),
    openPipelineDashboard: () => ipcRenderer.send('open-pipeline-dashboard'),
    getPipelineEvents: (limit, severity) => ipcRenderer.invoke('pipeline:get-recent', { limit, severity }),
    getPipelineCounts: () => ipcRenderer.invoke('pipeline:get-counts'),
    exportPipelineJson: (severity) => ipcRenderer.invoke('pipeline:export-json', { severity }),

    // External browser settings
    setExternalBrowser: (browser) => ipcRenderer.send('set-external-browser', browser),
    getExternalBrowser: () => ipcRenderer.invoke('get-external-browser'),
    setAutoRedirectAuth: (value) => ipcRenderer.send('set-auto-redirect-auth', value),
    getAutoRedirectAuth: () => ipcRenderer.invoke('get-auto-redirect-auth'),
    setAsDefaultBrowser: () => ipcRenderer.invoke('set-default-browser'),
    isDefaultBrowser: () => ipcRenderer.invoke('is-default-browser'),

    // Cookie management
    getAllCookies: () => ipcRenderer.invoke('cookies:get-all'),
    removeCookie: (url, name) => ipcRenderer.invoke('cookies:remove', { url, name }),
    clearAllCookies: () => ipcRenderer.invoke('cookies:clear-all'),
    getCookiesForDomain: (domain) => ipcRenderer.invoke('cookies:get-for-domain', domain),

    // Bookmark import/export
    exportBookmarks: (bookmarks) => ipcRenderer.invoke('bookmarks:export', bookmarks),
    importBookmarks: () => ipcRenderer.invoke('bookmarks:import'),
    
    // Event listeners - return function to remove listener
    on: (channel, callback) => {
        const validChannels = [
            'url-updated', 'tab-title-updated', 'page-visited', 'update-url-bar',
            'security-alert', 'typo-warning', 'reputation-warning', 'scan-results',
            'scareware-alert', 'navigation-error', 'tab-crashed', 'tab-unresponsive',
            'loading-start', 'loading-stop', 'browser-data-cleared', 'restore-session',
            'save-session-before-quit', 'typo-confirmation', 'password-breach-result',
            'download-started', 'download-progress', 'download-complete', 'download-cancelled', 'download-error',
            'show-toast', 'open-new-tab', 'menu-action', 'download-popup-closed', 'popup-clear-all-downloads',
            'premium-status-changed'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, callback);
            return () => ipcRenderer.removeListener(channel, callback);
        }
        return null;
    },
    
    // Send message (for custom events)
    send: (channel, data) => {
        const validChannels = ['typo-response'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    
    // Auth methods
    signup: (email, password) => ipcRenderer.invoke('auth:signup', { email, password }),
    login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getAuthUser: () => ipcRenderer.invoke('auth:get-user'),
    resendConfirmation: (email) => ipcRenderer.invoke('auth:resend-confirmation', { email }),
    checkConfirmation: () => ipcRenderer.invoke('auth:check-confirmation'),
    
    // Invoke for async responses
    invoke: (channel, data) => {
        const validChannels = [
            'auth:signup', 'auth:login', 'auth:logout', 'auth:get-user',
            'auth:resend-confirmation', 'auth:check-confirmation',
            'cloud:save-creds', 'cloud:test-connection', 'cloud:get-status',
            'cloud:clear-creds', 'cloud:list-files',
            'editor:cloud-upload', 'editor:cloud-download', 'editor:cloud-list',
            'show-save-dialog', 'show-open-dialog',
            'write-file', 'read-file',
            'crypto:encrypt', 'crypto:decrypt',
            'get-external-browser', 'get-auto-redirect-auth',
            'cookies:get-all', 'cookies:remove', 'cookies:clear-all', 'cookies:get-for-domain',
            'bookmarks:export', 'bookmarks:import',
            'usage:get-status',
            'pipeline:event', 'pipeline:get-recent', 'pipeline:get-counts', 'pipeline:export-json'
        ];
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
        return Promise.reject(new Error('Invalid channel'));
    }
});

// Also expose a legacy API for compatibility
window.legacyIpcRenderer = {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, callback) => ipcRenderer.on(channel, callback),
    once: (channel, callback) => ipcRenderer.once(channel, callback)
};