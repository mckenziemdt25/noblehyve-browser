require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { app, BrowserWindow, BrowserView, Menu, ipcMain, session, shell, dialog, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const https = require('https');
const url = require('url');
const { exec } = require('child_process');
const { MediumSecurity } = require('./medium-security');
const ContextSecurity = require('./context-security');
const fsSync = require('fs');
const crashFlagPath = path.join(app.getPath('userData'), 'session-clean');

let mainWindow;
let editorWindow = null;
let terminalWindow = null;
let browserViews = new Map();
let currentBrowserTabId = null;
let security = null;
let contextSecurity = null;
let cleanExit = false;

let downloadIdCounter = 0;
const activeDownloads = new Map();

let downloadPopupWindow = null;

// Single instance lock — prevents multiple instances and handles installer prompts
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

function sendToDownloadPopup(data) {
    if (downloadPopupWindow && !downloadPopupWindow.isDestroyed()) {
        downloadPopupWindow.webContents.send('update-popup', data);
    }
}

function positionDownloadPopup() {
    if (!downloadPopupWindow || downloadPopupWindow.isDestroyed()) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const bounds = mainWindow.getBounds();
    const x = bounds.x + bounds.width - 390;
    const y = bounds.y + 90;
    downloadPopupWindow.setPosition(Math.max(0, x), Math.max(0, y));
}

function createDownloadPopupWindow() {
    if (downloadPopupWindow && !downloadPopupWindow.isDestroyed()) return;
    downloadPopupWindow = new BrowserWindow({
        width: 380,
        height: 320,
        frame: false,
        skipTaskbar: true,
        resizable: false,
        show: false,
        parent: mainWindow,
        webPreferences: {
            preload: path.join(__dirname, 'preload-download-popup.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });
    downloadPopupWindow.loadFile('download-popup.html');
    downloadPopupWindow.setMaxListeners(20);
    downloadPopupWindow.once('closed', () => {
        downloadPopupWindow = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-popup-closed');
        }
    });
    downloadPopupWindow.once('ready-to-show', () => {
        positionDownloadPopup();
        downloadPopupWindow.show();
    });
}

let TerminalManager;
let EditorManager;
const usageManager = require('./usage-manager');

const sessionPath = path.join(app.getPath('userData'), 'session.json');

let externalBrowser = 'default';
let autoRedirectAuth = false;

function openInExternalBrowser(url, browser) {
    try {
        const target = browser || externalBrowser;
        if (target === 'default' || !target) {
            shell.openExternal(url);
            return true;
        }
        let cmd;
        if (target === 'edge') {
            cmd = `start msedge "${url}"`;
        } else if (target === 'chrome') {
            cmd = `start chrome "${url}"`;
        } else if (target === 'firefox') {
            cmd = `start firefox "${url}"`;
        } else {
            shell.openExternal(url);
            return true;
        }
        exec(cmd, (err) => {
            if (err) {
                console.error(`Failed to open ${target}, falling back to default:`, err);
                shell.openExternal(url);
            }
        });
        return true;
    } catch (err) {
        console.error('Failed to open external browser:', err);
        shell.openExternal(url);
        return false;
    }
}

// ============ AUTHENTICATION REDIRECT HANDLER ============

// List of authentication domains to redirect
const AUTH_DOMAINS = [
    'accounts.google.com', 'google.com/signin', 'accounts.youtube.com', 'mail.google.com',
    'login.microsoftonline.com', 'login.live.com', 'account.live.com', 'login.windows.net',
    'github.com/login', 'github.com/session', 'gitlab.com/users/sign_in', 'appleid.apple.com',
    'auth0.com', 'okta.com', 'facebook.com/login', 'twitter.com/login', 'linkedin.com/login',
    'dropbox.com/login', 'slack.com/signin', 'zoom.us/signin', 'discord.com/login',
    'twitch.tv/login', 'reddit.com/login', 'instagram.com/accounts/login', 'tiktok.com/login',
    'spotify.com/login', 'netflix.com/login', 'amazon.com/ap/signin', 'paypal.com/signin'
];

function isAuthPage(urlString) {
    try {
        const parsedUrl = new URL(urlString);
        const hostname = parsedUrl.hostname;
        return AUTH_DOMAINS.some(domain => 
            hostname === domain || hostname.endsWith('.' + domain) || hostname.includes(domain)
        );
    } catch { return false; }
}

function browserDisplayName(browser) {
    const names = { default: 'default browser', edge: 'Microsoft Edge', chrome: 'Google Chrome', firefox: 'Mozilla Firefox' };
    return names[browser] || 'default browser';
}

async function showAuthRedirectDialog(authUrl, window) {
    const browserName = browserDisplayName(externalBrowser);
    return new Promise((resolve) => {
        const serviceName = authUrl.includes('google') ? 'Google' : 
                           authUrl.includes('microsoft') ? 'Microsoft' : 
                           authUrl.includes('github') ? 'GitHub' : 'external';
        
        dialog.showMessageBox(window, {
            type: 'warning',
            title: 'External Authentication Required',
            message: 'Sign-in page detected',
            detail: `This website uses ${serviceName} authentication service.\n\nFor security and compatibility, sign-in works best in ${browserName}.\n\nWould you like to open this page in ${browserName}?`,
            buttons: ['Open in Browser', 'Stay Here'],
            defaultId: 0,
            cancelId: 1
        }).then((result) => {
            resolve(result.response === 0);
        });
    });
}

async function handleAuthRedirect(event, authUrl, webContents) {
    if (authUrl.includes('callback') || authUrl.includes('redirect') || authUrl.includes('code=')) return false;
    if (authUrl.startsWith('http://localhost') || authUrl.startsWith('file://')) return false;
    
    if (isAuthPage(authUrl)) {
        event.preventDefault();
        
        if (autoRedirectAuth) {
            openInExternalBrowser(authUrl);
            const browserName = browserDisplayName(externalBrowser);
            sendToMainWindow('show-toast', { message: `Redirected sign-in to ${browserName}`, type: 'info' });
            return true;
        }
        
        const openExternal = await showAuthRedirectDialog(authUrl, webContents);
        
        if (openExternal) {
            openInExternalBrowser(authUrl);
        } else {
            webContents.loadURL(authUrl);
        }
        return true;
    }
    return false;
}

function attachAuthRedirectHandler(view) {
    if (!view || !view.webContents) return;
    view.webContents.on('will-navigate', async (event, navigationUrl) => {
        const handled = await handleAuthRedirect(event, navigationUrl, view.webContents);
        if (handled) event.preventDefault();
    });
    view.webContents.on('will-redirect', async (event, navigationUrl) => {
        // Let auth redirects load inside the browser
    });
    view.webContents.setWindowOpenHandler(({ url }) => {
        if (isAuthPage(url)) {
            return { action: 'allow', overrideBrowserWindowOptions: { width: 800, height: 700, frame: true, autoHideMenuBar: true } };
        }
        sendToMainWindow('open-new-tab', { url, sourceId: currentBrowserTabId });
        return { action: 'deny' };
    });
}

function sendToMainWindow(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

async function saveSession(tabsData) {
    try {
        const sessionData = { tabs: tabsData, lastActive: Date.now() };
        await fs.writeFile(sessionPath, JSON.stringify(sessionData, null, 2));
    } catch (error) {
        console.error('Failed to save session:', error);
    }
}

async function loadSession() {
    try {
        const data = await fs.readFile(sessionPath, 'utf8');
        const sessionData = JSON.parse(data);
        if (Date.now() - sessionData.lastActive < 7 * 24 * 60 * 60 * 1000) {
            return sessionData.tabs;
        }
    } catch (error) { return null; }
    return null;
}

function setCleanFlag() {
    try {
        fsSync.writeFileSync(crashFlagPath, 'clean');
    } catch(e) { console.error('Failed to set clean flag', e); }
}
function clearCleanFlag() {
    try {
        if (fsSync.existsSync(crashFlagPath)) fsSync.unlinkSync(crashFlagPath);
    } catch(e) { console.error('Failed to clear clean flag', e); }
}
function wasCleanExit() {
    return fsSync.existsSync(crashFlagPath);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: true,
        backgroundColor: '#1e1e1e',
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    const windowId = mainWindow.webContents.id;
    mainWindow.loadFile('index.html');
    contextSecurity.registerTrustedWindow(windowId);
    
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });
    
    mainWindow.setMaxListeners(20);
    mainWindow.once('closed', () => {
        contextSecurity.unregisterWindow(windowId);
        mainWindow = null;
    });

    mainWindow.on('resize', () => {
        resizeAllBrowserViews();
        positionDownloadPopup();
    });
    mainWindow.on('move', () => positionDownloadPopup());
    mainWindow.on('minimize', () => {
        if (downloadPopupWindow && !downloadPopupWindow.isDestroyed()) {
            downloadPopupWindow.hide();
        }
    });
    mainWindow.on('restore', () => {
        if (downloadPopupWindow && !downloadPopupWindow.isDestroyed()) {
            downloadPopupWindow.show();
            positionDownloadPopup();
        }
    });
    
    // Crash recovery and session restore
    mainWindow.webContents.once('did-finish-load', async () => {
        const crashed = !wasCleanExit();  // flag missing = previous crash
        const savedTabs = await loadSession();
        
        if (savedTabs && savedTabs.length > 0) {
            if (crashed) {
                const { dialog } = require('electron');
                const result = await dialog.showMessageBox(mainWindow, {
                    type: 'question',
                    buttons: ['Restore Previous Tabs', 'Start Fresh'],
                    message: 'NobleHyve did not shut down properly last time.',
                    detail: 'Your previous browsing session was not closed correctly. Would you like to restore your tabs?'
                });
                if (result.response === 0) {
                    // restore session
                    mainWindow.webContents.send('restore-session', savedTabs);
                }
            } else {
                // optional: restore based on startupBehavior setting
                // you can read localStorage via executeJavaScript or use IPC
                // For simplicity, we only restore after crash for now.
            }
        }
        // Mark that we started cleanly (this session is alive)
        setCleanFlag();
    });
}

// In app.whenReady, after creating window, ensure cleanup on quit
app.on('will-quit', () => {
    clearCleanFlag();
    // Session saved via renderer IPC in before-quit
});

function resizeAllBrowserViews() {
    if (!mainWindow) return;
    let bounds;
    try { bounds = mainWindow.getBounds(); } catch (error) { return; }
    if (!bounds || typeof bounds.height !== 'number') return;
    const viewHeight = bounds.height - 90;
    if (viewHeight < 0) return;
    
    browserViews.forEach((view, id) => {
        if (id === currentBrowserTabId && view && !view.webContents.isDestroyed()) {
            try {
                view.setBounds({ x: 0, y: 90, width: bounds.width, height: viewHeight });
            } catch (err) { console.error(`Failed to resize view ${id}:`, err); }
        }
    });
}

function switchToBrowserTab(id, event = null) {
    if (!browserViews.has(id)) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    
    if (currentBrowserTabId && browserViews.has(currentBrowserTabId)) {
        const oldView = browserViews.get(currentBrowserTabId);
        if (oldView && !oldView.webContents.isDestroyed()) {
            mainWindow.removeBrowserView(oldView);
        }
    }
    
    currentBrowserTabId = id;
    const view = browserViews.get(id);
    if (view && !view.webContents.isDestroyed()) {
        mainWindow.addBrowserView(view);
        const bounds = mainWindow.getBounds();
        view.setBounds({ x: 0, y: 90, width: bounds.width, height: bounds.height - 90 });
        const currentUrl = view.webContents.getURL();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-url-bar', currentUrl || 'https://www.google.com');
        }
    }
}

function buildErrorPage(title, message) {
    return `<html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f5f7fb;color:#1f2937;padding:48px;">
        <h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
        <button onclick="location.reload()" style="padding:10px 16px;border:0;border-radius:6px;background:#0f6cbd;color:white;cursor:pointer;">Try again</button>
    </body></html>`;
}

function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function attachBrowserViewHandlers(view, id, event = null) {
    view.webContents.on('context-menu', (_, params) => {
        const canGoBack = view.webContents.canGoBack();
        const canGoForward = view.webContents.canGoForward();
        const menu = Menu.buildFromTemplate([
            { label: 'Back', enabled: canGoBack, click: () => view.webContents.goBack() },
            { label: 'Forward', enabled: canGoForward, click: () => view.webContents.goForward() },
            { label: 'Reload', click: () => view.webContents.reload() },
            { type: 'separator' },
            { label: 'Cut', enabled: params.editFlags.canCut, click: () => view.webContents.cut() },
            { label: 'Copy', enabled: params.editFlags.canCopy, click: () => view.webContents.copy() },
            { label: 'Paste', enabled: params.editFlags.canPaste, click: () => view.webContents.paste() },
            { label: 'Select All', enabled: params.editFlags.canSelectAll, click: () => view.webContents.selectAll() },
            { type: 'separator' },
            { label: 'Inspect Element', click: () => view.webContents.inspectElement(params.x, params.y) }
        ]);
        menu.popup({ window: mainWindow });
    });

    view.webContents.on('did-start-loading', () => sendToMainWindow('loading-start', { id }));
    view.webContents.on('did-stop-loading', () => sendToMainWindow('loading-stop', { id }));
    view.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) return;
        sendToMainWindow('navigation-error', { id, errorCode, errorDescription, url: validatedUrl });
        view.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildErrorPage('Page could not be loaded', `${errorDescription} (${errorCode})`))).catch(() => {});
    });
    view.webContents.on('render-process-gone', (_, details) => {
        sendToMainWindow('tab-crashed', { id, reason: details.reason, exitCode: details.exitCode });
        view.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildErrorPage('This tab crashed', 'NobleHyve kept the browser open. Reload the page to continue.'))).catch(() => {});
    });
    view.webContents.on('unresponsive', () => sendToMainWindow('tab-unresponsive', { id }));
    view.webContents.on('did-navigate', (_, newUrl) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (event) event.reply('url-updated', { id, url: newUrl });
            if (currentBrowserTabId === id) mainWindow.webContents.send('update-url-bar', newUrl);
            mainWindow.webContents.send('page-visited', newUrl, view.webContents.getTitle());
        }
    });
    view.webContents.on('did-navigate-in-page', (_, newUrl) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (event) event.reply('url-updated', { id, url: newUrl });
            if (currentBrowserTabId === id) mainWindow.webContents.send('update-url-bar', newUrl);
        }
    });
    view.webContents.on('page-title-updated', (_, title) => {
        if (mainWindow && !mainWindow.isDestroyed() && event) event.reply('tab-title-updated', { id, title });
    });
    
    attachAuthRedirectHandler(view);
}

function createEditorWindow() {
    if (editorWindow && !editorWindow.isDestroyed()) {
        editorWindow.focus();
        return;
    }

    editorWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload-editor.js'),
            sandbox: false,
            enableRemoteModule: false
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        backgroundColor: '#1e1e1e',
        show: true
    });

    editorWindow.loadFile('editor.html');
    editorWindow.setTitle('NobleHyve Code Editor');

    editorWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        const csp = [
            "default-src * 'unsafe-inline' 'unsafe-eval' data: blob: filesystem:",
            "script-src * 'unsafe-inline' 'unsafe-eval'",
            "style-src * 'unsafe-inline'",
            "img-src * data: blob:",
            "connect-src * data: blob: filesystem:",
            "font-src * data:",
            "frame-src *",
            "object-src 'none'"
        ].join('; ');
        const responseHeaders = details.responseHeaders || {};
        responseHeaders['Content-Security-Policy'] = [csp];
        callback({ responseHeaders });
    });
    
    editorWindow.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('file://')) return;
        if (url.includes('supabase.co')) return;
        event.preventDefault();
    });
    
    editorWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.includes('supabase.co') || url.includes('accounts.google.com')) {
            return { action: 'allow' };
        }
        return { action: 'deny' };
    });
    
    editorWindow.setMaxListeners(20);
    editorWindow.once('closed', () => { editorWindow = null; });
    editorWindow.webContents.on('crashed', () => {
        const pipeline = require('./kafka-pipeline');
        pipeline.crash({ type: 'editor-crashed', windowId: 'editor' });
        editorWindow = null;
    });
    console.log('✅ Editor window created');
}

function createTerminalWindow() {
    if (terminalWindow && !terminalWindow.isDestroyed()) {
        terminalWindow.focus();
        const tm = app.terminalManager;
        if (tm && tm.sessions) {
            const s = tm.sessions.get('main');
            if (!s || s.killed) {
                terminalWindow.webContents.reload();
            }
        }
        return;
    }

    terminalWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload-terminal.js'),
            sandbox: false,
            enableRemoteModule: false
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        backgroundColor: '#0c0c0c',
        show: true
    });

    terminalWindow.loadFile('terminal.html');
    terminalWindow.setTitle('NobleHyve Terminal');
    
    terminalWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        const csp = [
            "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
            "script-src * 'unsafe-inline' 'unsafe-eval'",
            "style-src * 'unsafe-inline'",
            "img-src * data: blob:",
            "connect-src * data: blob:",
            "font-src * data:",
            "frame-src *",
            "object-src 'none'"
        ].join('; ');
        const responseHeaders = details.responseHeaders || {};
        responseHeaders['Content-Security-Policy'] = [csp];
        callback({ responseHeaders });
    });
    
    terminalWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('file://')) event.preventDefault();
    });
    
    terminalWindow.setMaxListeners(20);
    terminalWindow.once('closed', () => {
        terminalWindow = null;
        if (app.terminalManager) {
            try { app.terminalManager.killAllSessions(); } catch (err) { console.error(err); }
        }
    });
}

function getSupabaseUserId() {
    try {
        const supabaseManager = require('./supabaseClient');
        const user = supabaseManager.getCurrentUser();
        return user?.id || null;
    } catch { return null; }
}

// ============ IPC HANDLERS ============
function setupIPCHandlers() {
    // Browser tab management
    ipcMain.on('new-browser-tab', async (event, { id, url }) => {
        let finalUrl = url || 'https://www.google.com';
        if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
        
        const view = new BrowserView({
            webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
        });
        
        browserViews.set(id, view);
        attachBrowserViewHandlers(view, id, event);
        
        if (security) {
            const phishingCheck = await security.checkPhishing(finalUrl);
            if (!phishingCheck.safe) {
                browserViews.delete(id);
                if (!view.webContents.isDestroyed()) view.webContents.destroy();
                sendToMainWindow('security-alert', { ...phishingCheck, url: finalUrl });
                return;
            }
            const typoCheck = security.checkTypoProtection(finalUrl);
            if (typoCheck.isTypo) sendToMainWindow('typo-warning', typoCheck);
        }
        
        await view.webContents.loadURL(finalUrl).catch(error => {
            sendToMainWindow('navigation-error', { id, errorDescription: error.message, url: finalUrl });
        });
        
        view.webContents.on('did-finish-load', async () => {
            try {
                const pageContent = await view.webContents.executeJavaScript('document.body?.innerText || ""');
                if (security) {
                    const scarewareCheck = security.detectScareware(pageContent, view.webContents.getURL());
                    if (scarewareCheck.isScareware) sendToMainWindow('scareware-alert', scarewareCheck);
                }
            } catch(e) { }
        });
        
        switchToBrowserTab(id, event);
    });

    ipcMain.on('new-private-tab', async (event, { id, url }) => {
        const finalUrl = url || 'https://duckduckgo.com';
        const privateSession = session.fromPartition('temp', { cache: false });
        
        const view = new BrowserView({
            webPreferences: { nodeIntegration: false, contextIsolation: true, session: privateSession, sandbox: true }
        });
        
        browserViews.set(id, view);
        attachBrowserViewHandlers(view, id, event);
        await view.webContents.loadURL(finalUrl).catch(error => {
            sendToMainWindow('navigation-error', { id, errorDescription: error.message, url: finalUrl });
        });
        
        view.webContents.on('destroyed', () => {
            privateSession.clearStorageData();
            privateSession.clearCache();
            console.log('🧹 Private tab data cleared');
        });
        
        switchToBrowserTab(id, event);
    });

    ipcMain.on('close-browser-tab', (event, id) => {
        if (!browserViews.has(id)) return;
        const view = browserViews.get(id);
        if (currentBrowserTabId === id) {
            if (view && !view.webContents.isDestroyed()) mainWindow.removeBrowserView(view);
            currentBrowserTabId = null;
        }
        if (view && !view.webContents.isDestroyed()) view.webContents.destroy();
        browserViews.delete(id);
        
        if (browserViews.size > 0 && !currentBrowserTabId) {
            const nextId = browserViews.keys().next().value;
            switchToBrowserTab(nextId, event);
        }
    });

    ipcMain.on('navigate', async (event, url) => {
        if (!currentBrowserTabId || !browserViews.has(currentBrowserTabId)) return;
        let finalUrl = url;
        if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
        
        if (security) {
            const phishingCheck = await security.checkPhishing(finalUrl);
            if (!phishingCheck.safe) {
                sendToMainWindow('security-alert', { ...phishingCheck, url: finalUrl });
                return;
            }
            const typoCheck = security.checkTypoProtection(finalUrl);
            if (typoCheck.isTypo) {
                sendToMainWindow('typo-warning', typoCheck);
                const proceed = await new Promise(resolve => {
                    sendToMainWindow('typo-confirmation', typoCheck);
                    ipcMain.once('typo-response', (_, response) => resolve(response));
                });
                if (!proceed) return;
            }
            const reputationCheck = await security.checkCloudReputation(finalUrl);
            if (reputationCheck.warning) sendToMainWindow('reputation-warning', reputationCheck);
        }
        
        const view = browserViews.get(currentBrowserTabId);
        if (view && !view.webContents.isDestroyed()) {
            view.webContents.loadURL(finalUrl).catch(error => {
                sendToMainWindow('navigation-error', { id: currentBrowserTabId, errorDescription: error.message, url: finalUrl });
            });
        }
    });

    ipcMain.on('back', () => {
        if (currentBrowserTabId && browserViews.has(currentBrowserTabId)) {
            const view = browserViews.get(currentBrowserTabId);
            if (view && !view.webContents.isDestroyed() && view.webContents.canGoBack()) view.webContents.goBack();
        }
    });

    ipcMain.on('forward', () => {
        if (currentBrowserTabId && browserViews.has(currentBrowserTabId)) {
            const view = browserViews.get(currentBrowserTabId);
            if (view && !view.webContents.isDestroyed() && view.webContents.canGoForward()) view.webContents.goForward();
        }
    });

    ipcMain.on('refresh', () => {
        if (currentBrowserTabId && browserViews.has(currentBrowserTabId)) {
            const view = browserViews.get(currentBrowserTabId);
            if (view && !view.webContents.isDestroyed()) view.webContents.reload();
        }
    });

    ipcMain.on('print-page', () => {
        if (currentBrowserTabId && browserViews.has(currentBrowserTabId)) {
            const view = browserViews.get(currentBrowserTabId);
            if (view && !view.webContents.isDestroyed()) view.webContents.print();
        }
    });

    ipcMain.on('set-zoom', (event, zoomLevel) => {
        if (currentBrowserTabId && browserViews.has(currentBrowserTabId)) {
            const view = browserViews.get(currentBrowserTabId);
            if (view && !view.webContents.isDestroyed()) view.webContents.setZoomLevel(zoomLevel);
        }
    });

    ipcMain.on('find-in-page', (event, text) => {
        if (currentBrowserTabId && browserViews.has(currentBrowserTabId)) {
            const view = browserViews.get(currentBrowserTabId);
            if (view && !view.webContents.isDestroyed() && text) view.webContents.findInPage(text);
        }
    });

    ipcMain.on('stop-find-in-page', () => {
        if (currentBrowserTabId && browserViews.has(currentBrowserTabId)) {
            const view = browserViews.get(currentBrowserTabId);
            if (view && !view.webContents.isDestroyed()) view.webContents.stopFindInPage('clearSelection');
        }
    });

    ipcMain.on('toggle-current-devtools', () => {
        if (currentBrowserTabId && browserViews.has(currentBrowserTabId)) {
            const view = browserViews.get(currentBrowserTabId);
            if (view && !view.webContents.isDestroyed()) view.webContents.toggleDevTools();
        }
    });

    ipcMain.on('open-downloads-folder', () => {
        const downloadsPath = app.getPath('downloads');
        shell.openPath(downloadsPath);
    });

    ipcMain.on('cancel-download', (event, id) => {
        const dl = activeDownloads.get(id);
        if (dl && dl.item && dl.item.getState() === 'progressing') {
            dl.item.cancel();
        }
    });

    ipcMain.on('open-download-file', (event, filePath) => {
        shell.showItemInFolder(filePath);
    });

    // Cookie management
    ipcMain.handle('cookies:get-all', async () => {
        try {
            const cookies = await session.defaultSession.cookies.get({});
            const grouped = {};
            for (const c of cookies) {
                const domain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
                if (!grouped[domain]) grouped[domain] = [];
                grouped[domain].push(c);
            }
            return { success: true, cookies: grouped };
        } catch (error) {
            return { success: false, error: error.message, cookies: {} };
        }
    });

    ipcMain.handle('cookies:remove', async (event, { url, name }) => {
        try {
            await session.defaultSession.cookies.remove(url, name);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cookies:clear-all', async () => {
        try {
            const cookies = await session.defaultSession.cookies.get({});
            for (const c of cookies) {
                const url = (c.secure ? 'https' : 'http') + '://' + c.domain + c.path;
                await session.defaultSession.cookies.remove(url, c.name);
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cookies:get-for-domain', async (event, domain) => {
        try {
            const cookies = await session.defaultSession.cookies.get({ domain });
            return { success: true, cookies };
        } catch (error) {
            return { success: false, error: error.message, cookies: [] };
        }
    });

    // Bookmark import/export
    ipcMain.handle('bookmarks:export', async (event, bookmarks) => {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Bookmarks',
            defaultPath: 'bookmarks.html',
            filters: [{ name: 'HTML Bookmarks', extensions: ['html', 'htm'] }]
        });
        if (canceled || !filePath) return { success: false, canceled: true };

        const header = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>`;
        const footer = `</DL><p>`;
        let items = '';
        for (const bm of bookmarks) {
            if (bm.folder) {
                items += `    <DT><H3>${escapeHtml(bm.name)}</H3>\n    <DL><p>\n`;
                for (const child of bm.children || []) {
                    items += `        <DT><A HREF="${escapeHtml(child.url)}">${escapeHtml(child.title)}</A>\n`;
                }
                items += `    </DL><p>\n`;
            } else {
                items += `    <DT><A HREF="${escapeHtml(bm.url)}">${escapeHtml(bm.title)}</A>\n`;
            }
        }
        const content = header + items + footer;

        try {
            await fs.writeFile(filePath, content, 'utf-8');
            return { success: true, path: filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('bookmarks:import', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Import Bookmarks',
            filters: [{ name: 'HTML Bookmarks', extensions: ['html', 'htm'] }],
            properties: ['openFile']
        });
        if (canceled || !filePaths || !filePaths[0]) return { success: false, canceled: true };

        try {
            const content = await fs.readFile(filePaths[0], 'utf-8');
            const bookmarks = [];
            const linkRegex = /<A\s+HREF="([^"]*)"[^>]*>([^<]*)<\/A>/gi;
            const folderRegex = /<H3[^>]*>([^<]*)<\/H3>/gi;
            let match;
            while ((match = linkRegex.exec(content)) !== null) {
                if (match[1] && !match[1].startsWith('place:')) {
                    bookmarks.push({ title: match[2] || match[1], url: match[1] });
                }
            }
            return { success: true, bookmarks };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    ipcMain.on('set-external-browser', (event, browser) => {
        if (['default', 'edge', 'chrome', 'firefox'].includes(browser)) {
            externalBrowser = browser;
            sendToMainWindow('show-toast', { message: `External browser set to ${browserDisplayName(browser)}`, type: 'info' });
        }
    });

    ipcMain.handle('get-external-browser', () => externalBrowser);

    ipcMain.on('set-auto-redirect-auth', (event, value) => {
        autoRedirectAuth = !!value;
    });

    ipcMain.handle('get-auto-redirect-auth', () => autoRedirectAuth);

    ipcMain.on('clear-browser-data', async () => {
        try {
            await session.defaultSession.clearCache();
            await session.defaultSession.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'shadercache', 'serviceworkers'] });
            sendToMainWindow('browser-data-cleared');
        } catch (error) {
            sendToMainWindow('navigation-error', { errorDescription: error.message });
        }
    });

    ipcMain.on('show-browser', (event, id) => {
        if (id && browserViews.has(id)) switchToBrowserTab(id, event);
    });

    ipcMain.on('hide-browser', () => {
        if (currentBrowserTabId && browserViews.has(currentBrowserTabId)) {
            const view = browserViews.get(currentBrowserTabId);
            if (view && !view.webContents.isDestroyed()) mainWindow.removeBrowserView(view);
        }
    });

    ipcMain.on('save-session', (event, tabsData) => saveSession(tabsData));
    
    ipcMain.on('check-password-breach', async (event, password) => {
        if (security) {
            const result = await security.checkPasswordBreach(password);
            event.reply('password-breach-result', result);
        }
    });

    ipcMain.on('scan-page', async (event) => {
        if (currentBrowserTabId && browserViews.has(currentBrowserTabId) && security) {
            const view = browserViews.get(currentBrowserTabId);
            if (view && !view.webContents.isDestroyed()) {
                const url = view.webContents.getURL();
                const pageContent = await view.webContents.executeJavaScript('document.body?.innerText || ""');
                const results = {
                    url, timestamp: new Date().toISOString(),
                    checks: {
                        phishing: await security.checkPhishing(url),
                        scareware: security.detectScareware(pageContent, url),
                        typo: security.checkTypoProtection(url),
                        cloudReputation: await security.checkCloudReputation(url)
                    }
                };
                let score = 100;
                if (!results.checks.phishing.safe) score -= 50;
                if (results.checks.scareware.isScareware) score -= 40;
                if (results.checks.typo.isTypo) score -= 20;
                if (results.checks.cloudReputation.warning) score -= 15;
                results.safetyScore = Math.max(0, score);
                sendToMainWindow('scan-results', results);
            }
        }
    });

    // Window management
    ipcMain.on('open-editor', () => { try { createEditorWindow(); } catch (err) { console.error(err); } });
    ipcMain.on('open-terminal', () => { try { createTerminalWindow(); } catch (err) { console.error(err); } });
    ipcMain.on('open-premium-page', () => {
        const url = 'https://mckenzie01.gumroad.com/l/yozdw';
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('open-new-tab', { url });
            mainWindow.focus();
            if (mainWindow.isMinimized()) mainWindow.restore();
        } else {
            shell.openExternal(url);
        }
    });
    ipcMain.handle('set-default-browser', async () => {
        try {
            app.setAsDefaultProtocolClient('http');
            app.setAsDefaultProtocolClient('https');
            app.setAsDefaultProtocolClient('ftp');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    ipcMain.handle('is-default-browser', async () => {
        try {
            const isDefault = app.isDefaultProtocolClient('http');
            return { isDefault };
        } catch (error) {
            return { isDefault: false, error: error.message };
        }
    });
    ipcMain.on('open-pipeline-dashboard', () => { shell.openExternal('http://localhost:8080'); });

    ipcMain.on('update-download-popup-state', (event, downloads) => {
        sendToDownloadPopup(downloads);
    });

    ipcMain.on('show-download-popup', (event, downloads) => {
        createDownloadPopupWindow();
        sendToDownloadPopup(downloads || []);
    });

    ipcMain.on('hide-download-popup', () => {
        if (downloadPopupWindow && !downloadPopupWindow.isDestroyed()) {
            downloadPopupWindow.close();
        }
    });

    ipcMain.on('popup-cancel-download', (event, id) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.close();
        const dl = activeDownloads.get(id);
        if (dl && dl.item && dl.item.getState() === 'progressing') {
            dl.item.cancel();
        }
    });

    ipcMain.on('popup-open-file', (event, filePath) => {
        shell.showItemInFolder(filePath);
    });

    ipcMain.on('popup-view-all', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.close();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('menu-action', 'downloads');
        }
    });

    ipcMain.on('popup-clear-all', (event) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('popup-clear-all-downloads');
        }
    });

    ipcMain.on('popup-close', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.close();
    });

    ipcMain.on('show-more-menu', (event) => {
        const template = [
            { label: 'New Tab', click: () => event.sender.send('menu-action', 'new-tab') },
            { label: 'New Private Tab', click: () => event.sender.send('menu-action', 'private-tab') },
            { label: 'History', click: () => event.sender.send('menu-action', 'history') },
            { label: 'Downloads', click: () => event.sender.send('menu-action', 'downloads') },
            { type: 'separator' },
            { label: 'Zoom Out', click: () => event.sender.send('menu-action', 'zoom-out') },
            { label: 'Reset Zoom', click: () => event.sender.send('menu-action', 'zoom-reset') },
            { label: 'Zoom In', click: () => event.sender.send('menu-action', 'zoom-in') },
            { label: 'Find on Page', click: () => event.sender.send('menu-action', 'find') },
            { label: 'Print', click: () => event.sender.send('menu-action', 'print') },
            { type: 'separator' },
            { label: 'Developer Tools', click: () => event.sender.send('menu-action', 'devtools') },
            { label: 'Settings', click: () => event.sender.send('menu-action', 'settings') },
        ];
        const menu = Menu.buildFromTemplate(template);
        menu.popup({ window: mainWindow });
    });

    // ============ PREMIUM LICENSE HANDLERS ============
    ipcMain.handle('license:get-status', async () => {
        const licenseManager = require('./license-manager');
        return licenseManager.getLicenseStatus();
    });

    ipcMain.handle('license:activate', async (event, licenseKey) => {
        const licenseManager = require('./license-manager');
        const result = await licenseManager.activateLicense(licenseKey);
        if (result.success) {
            usageManager.resetOnPremium();
            try {
                const cloudflare = require('./cloudflare');
                const migrateResult = await cloudflare.migrateToPremium();
                result.migration = migrateResult;
            } catch (err) {
                console.error('Cloud migration on activate failed:', err.message);
                result.migration = { success: false, error: err.message };
            }
        }
        return result;
    });

    ipcMain.handle('license:deactivate', async () => {
        const licenseManager = require('./license-manager');
        const result = licenseManager.deactivateLicense();
        if (result.success) {
            try {
                const cloudflare = require('./cloudflare');
                const downgradeResult = await cloudflare.downgradeToFree();
                result.migration = downgradeResult;
            } catch (err) {
                console.error('Cloud downgrade on deactivate failed:', err.message);
                result.migration = { success: false, error: err.message };
            }
        }
        return result;
    });

    ipcMain.handle('license:is-premium', async () => {
        const licenseManager = require('./license-manager');
        return { isPremium: licenseManager.isPremiumUser() };
    });

    // Auto-downgrade when subscription expires
    const licenseManager = require('./license-manager');
    licenseManager.on('status-changed', async ({ isPremium, reason }) => {
        if (!isPremium && (reason === 'subscription_ended' || reason === 'license_removed')) {
            console.log('Subscription expired — auto-downgrading cloud storage to free');
            try {
                const cloudflare = require('./cloudflare');
                await cloudflare.downgradeToFree();
            } catch (err) {
                console.error('Auto-downgrade failed:', err.message);
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('premium-status-changed', { isPremium: false, reason });
            }
        }
    });

    ipcMain.handle('usage:get-status', async () => {
        const licenseManager = require('./license-manager');
        const isPremium = licenseManager.isPremiumUser();
        const status = usageManager.getStatus();
        try {
            const cloudflare = require('./cloudflare');
            const stats = await cloudflare.getStorageStats(null, isPremium);
            status.cloudBytesUsed = stats.success ? stats.totalSize : (status.cloudBytesUsed || 0);
            status.cloudFileCount = stats.success ? stats.fileCount : 0;
        } catch {
            status.cloudBytesUsed = status.cloudBytesUsed || 0;
            status.cloudFileCount = 0;
        }
        return status;
    });

    // Editor cloud storage
    // Uses local persistent UUID (not Supabase ID) so files are always recoverable
    // regardless of login state. This avoids the bug where changing login status
    // makes previously saved files disappear.
    ipcMain.handle('editor:cloud-upload', async (event, { filename, encryptedContent }) => {
        const licenseManager = require('./license-manager');
        const isPremium = licenseManager.isPremiumUser();
        const fileBytes = Buffer.byteLength(encryptedContent, 'utf8');
        const maxBytes = usageManager.getCloudMaxBytes();
        try {
            const cloudflare = require('./cloudflare');
            const stats = await cloudflare.getStorageStats(null, isPremium, true);
            if (!stats.success) {
                console.error('Cloud storage verification failed:', stats.error);
                return { success: false, error: stats.error || 'Could not verify cloud storage usage. Please try again.' };
            }
            if (stats.totalSize + fileBytes > maxBytes) {
                const maxMB = Math.round(maxBytes / (1024 * 1024));
                return { success: false, error: `Cloud storage limit reached (${maxMB} MB). Delete some files or upgrade to Premium.`, requiresPremium: !isPremium };
            }
            return await cloudflare.uploadFile(filename, encryptedContent, null, isPremium);
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('editor:cloud-download', async (event, { filename }) => {
        const licenseManager = require('./license-manager');
        const isPremium = licenseManager.isPremiumUser();
        try {
            const cloudflare = require('./cloudflare');
            return await cloudflare.downloadFile(filename, null, isPremium);
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('editor:cloud-list', async () => {
        const licenseManager = require('./license-manager');
        const isPremium = licenseManager.isPremiumUser();
        try {
            const cloudflare = require('./cloudflare');
            return await cloudflare.listFiles(null, isPremium);
        } catch (error) {
            return { success: false, error: error.message, files: [] };
        }
    });

    ipcMain.handle('editor:cloud-delete', async (event, { filename }) => {
        const licenseManager = require('./license-manager');
        const isPremium = licenseManager.isPremiumUser();
        try {
            const cloudflare = require('./cloudflare');
            return await cloudflare.deleteFile(filename, null, isPremium);
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Editor code execution
    ipcMain.handle('editor:execute-code', async (event, { language, code }) => {
        const langRunners = {
            python: { cmd: 'python', args: ['-c', code] },
            ruby: { cmd: 'ruby', args: ['-e', code] },
            php: { cmd: 'php', args: ['-r', code] },
            perl: { cmd: 'perl', args: ['-e', code] },
            lua: { cmd: 'lua', args: ['-e', code] },
            go: { cmd: 'go', args: ['run', '-'] },
            rust: { cmd: 'rustc', args: [] },
            kotlin: { cmd: 'kotlin', args: ['-e', code] },
            swift: { cmd: 'swift', args: ['-e', code] },
            dart: { cmd: 'dart', args: ['-e', code] },
            haskell: { cmd: 'runhaskell', args: ['-e', code] },
            shell: { cmd: process.platform === 'win32' ? 'cmd' : 'bash', args: process.platform === 'win32' ? ['/c', code] : ['-c', code] },
            powershell: { cmd: 'powershell', args: ['-Command', code] },
            c: { cmd: 'gcc', args: [] },
            cpp: { cmd: 'g++', args: [] },
            csharp: { cmd: 'dotnet', args: ['script', '-'] },
            java: { cmd: 'java', args: [] }
        };
        const runner = langRunners[language];
        if (!runner) return { success: false, error: `No executor for language: ${language}` };
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);
            const cmdStr = `${runner.cmd} ${runner.args.join(' ')}`;
            const { stdout, stderr } = await execPromise(cmdStr, {
                timeout: 30000,
                input: code,
                maxBuffer: 1024 * 1024
            });
            return { success: true, stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
        } catch (error) {
            if (error.stdout || error.stderr) {
                return { success: true, stdout: (error.stdout || '').trim(), stderr: (error.stderr || '').trim(), exitCode: error.code || 1 };
            }
            return { success: false, error: error.message };
        }
    });

    // File operations
    ipcMain.handle('show-save-dialog', async (event, options) => dialog.showSaveDialog(options));
    ipcMain.handle('show-open-dialog', async (event, options) => dialog.showOpenDialog(options));
    
    ipcMain.handle('write-file', async (event, { filePath, content }) => {
        try {
            await fs.writeFile(filePath, content, 'utf8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('read-file', async (event, { filePath, password }) => {
        try {
            const raw = await fs.readFile(filePath, 'utf8');
            let content = raw, encrypted = false;
            try {
                const parsed = JSON.parse(raw);
                if (parsed.__encrypted) {
                    encrypted = true;
                    if (!password) return { success: false, encrypted: true, error: 'File is encrypted. Provide a password.' };
                    const crypto = require('crypto');
                    const key = crypto.scryptSync(password, 'salt', 32);
                    const iv = Buffer.from(parsed.iv, 'hex');
                    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                    let decrypted = decipher.update(parsed.content, 'hex', 'utf8');
                    decrypted += decipher.final('utf8');
                    content = decrypted;
                } else if (parsed.algorithm && parsed.salt) {
                    encrypted = true;
                    if (!password) return { success: false, encrypted: true, error: 'File is encrypted. Provide a password.' };
                    const encryption = require('./encryption');
                    const decrypted = encryption.decryptData(raw, password);
                    if (decrypted === null) return { success: false, encrypted: true, error: 'Incorrect password' };
                    content = decrypted;
                }
            } catch (_) {}
            return { success: true, content, encrypted };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('rename-file', async (event, { oldPath, newName }) => {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        const dir = path.dirname(oldPath);
        const newPath = path.join(dir, newName);
        await fs.rename(oldPath, newPath);
        return { success: true, newPath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

    ipcMain.handle('crypto:encrypt', async (event, { content, password }) => {
        const encryption = require('./encryption');
        return encryption.encryptData(content, password);
    });

    ipcMain.handle('crypto:decrypt', async (event, { encrypted, password }) => {
        const encryption = require('./encryption');
        const decrypted = encryption.decryptData(encrypted, password);
        return decrypted;
    });

    // Encrypted local file handlers
    ipcMain.handle('save-encrypted-file', async (event, { filename, content, password }) => {
        try {
            const encryption = require('./encryption');
            const encrypted = encryption.encryptData(content, password);
            const desktopPath = app.getPath('desktop');
            const filePath = path.join(desktopPath, filename);
            await fs.writeFile(filePath, encrypted, 'utf8');
            return { success: true, path: filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('read-encrypted-file', async (event, { filePath, password }) => {
        try {
            const encrypted = await fs.readFile(filePath, 'utf8');
            const encryption = require('./encryption');
            const decrypted = encryption.decryptData(encrypted, password);
            if (decrypted === null) {
                return { success: false, error: 'Incorrect password or corrupted file' };
            }
            return { success: true, content: decrypted };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('list-encrypted-files', async () => {
        try {
            const desktopPath = app.getPath('desktop');
            const files = await fs.readdir(desktopPath);
            const encFiles = files.filter(f => f.endsWith('.enc')).map(f => ({
                name: f,
                path: path.join(desktopPath, f)
            }));
            return { success: true, files: encFiles };
        } catch (error) {
            return { success: false, error: error.message, files: [] };
        }
    });

    // Terminal handlers - all handled by terminal-manager.js
    // No duplicate handlers here to avoid conflicts

    // Cloud storage (R2)
    ipcMain.handle('cloud:save-creds', async (event, { accountId, accessKey, secretKey }) => {
        try {
            const cloudflare = require('./cloudflare');
            const result = cloudflare.saveCredentials(accountId, accessKey, secretKey);
            return { success: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cloud:test-connection', async () => {
        try {
            const cloudflare = require('./cloudflare');
            return await cloudflare.testConnection();
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('cloud:get-status', async () => {
        try {
            const licenseManager = require('./license-manager');
            const isPremium = licenseManager.isPremiumUser();
            const cloudflare = require('./cloudflare');
            const stats = await cloudflare.getStorageStats(null, isPremium);
            return {
                configured: cloudflare.hasCredentials(),
                connected: cloudflare.isConnected(),
                isPremium,
                stats: stats.success ? stats : null
            };
        } catch {
            return { configured: false, connected: false, stats: null };
        }
    });

    ipcMain.handle('cloud:clear-creds', async () => {
        try {
            const cloudflare = require('./cloudflare');
            cloudflare.clearCredentials();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cloud:list-files', async () => {
        try {
            const licenseManager = require('./license-manager');
            const isPremium = licenseManager.isPremiumUser();
            const cloudflare = require('./cloudflare');
            return await cloudflare.listFiles(null, isPremium);
        } catch (error) {
            return { success: false, error: error.message, files: [] };
        }
    });

    ipcMain.on('toggle-editor-devtools', () => {
        if (editorWindow && !editorWindow.isDestroyed()) editorWindow.webContents.toggleDevTools();
    });

    // ============ DATA PIPELINE (Kafka) ============
    ipcMain.handle('pipeline:event', async (event, { topic, data }) => {
        const pipeline = require('./kafka-pipeline');
        await pipeline.raw(topic, data);
    });

    ipcMain.handle('pipeline:get-recent', (event, { limit, severity }) => {
        const pipeline = require('./kafka-pipeline');
        return pipeline.getRecent(limit, severity);
    });

    ipcMain.handle('pipeline:get-counts', () => {
        const pipeline = require('./kafka-pipeline');
        return pipeline.getCounts();
    });

    ipcMain.handle('pipeline:export-json', (event, { severity }) => {
        const pipeline = require('./kafka-pipeline');
        return pipeline.exportJson(severity);
    });
}

// ============ DATA PIPELINE HELPERS ============
function wirePipeline() {
    const pipeline = require('./kafka-pipeline');
    pipeline.connect();

    // Capture all console.error as pipeline errors
    const origConsoleError = console.error;
    console.error = function (...args) {
        origConsoleError.apply(console, args);
        const msg = args.map(a => typeof a === 'string' ? a : a?.message || a?.stack || JSON.stringify(a)).join(' ');
        pipeline.crash({ type: 'console-error', message: msg, stack: new Error().stack });
    };
}

// ============ APP LIFECYCLE ============
app.whenReady().then(async () => {
    security = new MediumSecurity();
    await security.init();
    contextSecurity = new ContextSecurity();
    contextSecurity.setWorkspaceRoot(app.getPath('documents'));

    session.defaultSession.on('will-download', (event, item, webContents) => {
        const id = ++downloadIdCounter;
        const filename = item.getFilename();
        const downloadPath = path.join(app.getPath('downloads'), filename);

        let fileIndex = 1;
        let finalPath = downloadPath;
        while (fsSync.existsSync(finalPath)) {
            const ext = path.extname(filename);
            const base = path.basename(filename, ext);
            finalPath = path.join(app.getPath('downloads'), `${base} (${fileIndex})${ext}`);
            fileIndex++;
        }
        item.setSavePath(finalPath);

        const dlRecord = { item, filename, path: finalPath, startTime: Date.now() };
        activeDownloads.set(id, dlRecord);

        sendToMainWindow('download-started', { id, filename, totalBytes: item.getTotalBytes(), path: finalPath });

        item.on('updated', (event, state) => {
            if (state === 'progressing') {
                const received = item.getReceivedBytes();
                const total = item.getTotalBytes();
                const percent = total > 0 ? Math.round((received / total) * 100) : 0;
                const speed = item.getCurrentBytesPerSecond();
                sendToMainWindow('download-progress', { id, receivedBytes: received, totalBytes: total, percent, speed });
            }
        });

        item.on('done', (event, state) => {
            activeDownloads.delete(id);
            if (state === 'completed') {
                let size = 0;
                try { size = fsSync.statSync(finalPath).size; } catch (e) {}
                sendToMainWindow('download-complete', { id, filename, path: finalPath, size, totalBytes: item.getTotalBytes() });
            } else if (state === 'cancelled') {
                sendToMainWindow('download-cancelled', { id, filename });
                try { if (fsSync.existsSync(finalPath)) fsSync.unlinkSync(finalPath); } catch (e) {}
            } else if (state === 'interrupted') {
                sendToMainWindow('download-error', { id, filename, path: finalPath, error: item.getState() });
            }
        });
    });
    
    try {
        TerminalManager = require('./terminal-manager');
        app.terminalManager = new TerminalManager(() => createTerminalWindow());
        console.log('Terminal manager loaded successfully');
    } catch (error) {
        console.log('Terminal manager not loaded:', error.message);
        app.terminalManager = {
            killAllSessions: () => {},
            createSession: async () => ({ success: false, error: 'Terminal not available' })
        };
    }
    
    try {
        EditorManager = require('./editor-manager');
        app.editorManager = new EditorManager();
        console.log('Editor manager loaded successfully');
    } catch (error) {
        console.log('Editor manager not loaded:', error.message);
    }
    
    setupIPCHandlers();
    wirePipeline();
    if (process.argv.includes('--pipeline-server')) {
        try {
            const { start } = require('./pipeline-server');
            start();
        } catch (err) {
            console.error('Failed to start pipeline server:', err.message);
        }
    }
    createWindow();

    // Re-verify license on wake from sleep
    powerMonitor.on('resume', () => {
        console.log('System resumed from sleep — re-verifying license');
        try {
            const licenseManager = require('./license-manager');
            licenseManager.refreshStatus();
        } catch (err) {
            console.error('License re-verification on resume failed:', err.message);
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (app.terminalManager) {
            try { app.terminalManager.killAllSessions(); } catch (err) { console.error(err); }
        }
        app.quit();
    }
});

app.on('before-quit', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('save-session-before-quit');
    }
    if (app.terminalManager) {
        try { app.terminalManager.killAllSessions(); } catch (err) { console.error(err); }
    }
    const pipeline = require('./kafka-pipeline');
    pipeline.disconnect();
});

process.on('uncaughtException', (error) => {
    const pipeline = require('./kafka-pipeline');
    pipeline.crash({ type: 'uncaught-exception', message: error.message, stack: error.stack });
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
    const pipeline = require('./kafka-pipeline');
    pipeline.crash({ type: 'unhandled-rejection', message: reason?.message || String(reason), stack: reason?.stack });
    console.error('Unhandled Rejection:', reason);
});

app.on('web-contents-created', (_, contents) => {
    contents.on('render-process-gone', (event, details) => {
        const pipeline = require('./kafka-pipeline');
        pipeline.crash({ type: 'render-process-gone', reason: details.reason, exitCode: details.exitCode });
    });
});