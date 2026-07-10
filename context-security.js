// context-security.js - SECURE VERSION with URL validation
const { session, webContents } = require('electron');
const path = require('path');

class ContextSecurity {
    constructor() {
        this.trustedWindows = new Set();
        this.editorWindows = new Set();
        this.browserViewIds = new Set();
        this.workspaceRoot = null;
        
        // Allowed URLs for IPC communication
        this.allowedUrls = [
            'index.html',
            'editor.html',
            'terminal.html'
        ];
    }

    setWorkspaceRoot(dirPath) {
        this.workspaceRoot = dirPath;
    }

    registerTrustedWindow(webContentsId) {
        this.trustedWindows.add(webContentsId);
    }

    registerEditorWindow(webContentsId) {
        this.trustedWindows.add(webContentsId);
        this.editorWindows.add(webContentsId);
    }

    registerBrowserView(webContentsId) {
        this.browserViewIds.add(webContentsId);
    }

    unregisterWindow(webContentsId) {
        this.trustedWindows.delete(webContentsId);
        this.editorWindows.delete(webContentsId);
    }

    unregisterBrowserView(webContentsId) {
        this.browserViewIds.delete(webContentsId);
    }

    // ✅ SECURITY: Enhanced validation with URL checking
    isFromTrustedWindow(event) {
        const sender = event.sender;
        const senderId = sender.id;
        
        // Check 1: Window ID must be registered
        if (!this.trustedWindows.has(senderId)) {
            console.warn(`[SECURITY] IPC blocked - unknown window ID: ${senderId}`);
            return false;
        }
        
        // Check 2: URL must be from allowed local files
        try {
            const url = sender.getURL();
            const isAllowed = this.allowedUrls.some(allowed => url.includes(allowed));
            
            if (!isAllowed) {
                console.warn(`[SECURITY] IPC blocked - invalid URL: ${url}`);
                return false;
            }
        } catch (err) {
            console.warn(`[SECURITY] IPC blocked - cannot validate URL: ${err.message}`);
            return false;
        }
        
        // Check 3: In production, DevTools should not be open
        if (process.env.NODE_ENV === 'production' && sender.isDevToolsOpened()) {
            console.warn(`[SECURITY] IPC blocked - DevTools open in production`);
            return false;
        }
        
        return true;
    }

    // ✅ SECURITY: Editor-specific validation
    isFromEditor(event) {
        const senderId = event.sender.id;
        
        if (!this.editorWindows.has(senderId)) {
            console.warn(`[SECURITY] Editor IPC blocked from non-editor source: ${senderId}`);
            return false;
        }
        
        // Additional URL validation for editor
        const url = event.sender.getURL();
        if (!url.includes('editor.html')) {
            console.warn(`[SECURITY] Editor IPC blocked - not from editor.html: ${url}`);
            return false;
        }
        
        return true;
    }

    // ✅ SECURITY: BrowserView validation
    isFromBrowserView(event) {
        const viewId = event.sender.id;
        
        if (!this.browserViewIds.has(viewId)) {
            console.warn(`[SECURITY] BrowserView IPC blocked - unknown view: ${viewId}`);
            return false;
        }
        
        return true;
    }

    // ✅ SECURITY: Path validation with workspace root
    validateFilePath(requestedPath) {
        if (!this.workspaceRoot) return true;
        
        try {
            const resolved = require('path').resolve(requestedPath);
            const isValid = resolved.startsWith(this.workspaceRoot);
            
            if (!isValid) {
                console.warn(`[SECURITY] Path traversal blocked: ${requestedPath} -> ${resolved}`);
            }
            
            return isValid;
        } catch (err) {
            console.warn(`[SECURITY] Path validation error: ${err.message}`);
            return false;
        }
    }

    // ✅ SECURITY: CSP for editor window
    getCSPForEditor() {
        return [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "font-src 'self'",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'"
        ].join('; ');
    }

    // ✅ SECURITY: CSP for terminal window
    getCSPForTerminal() {
        return [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "font-src 'self'",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'"
        ].join('; ');
    }

    // ✅ SECURITY: Setup browser view security headers
    setupBrowserViewSession(browserSession) {
        browserSession.webRequest.onHeadersReceived((details, callback) => {
            const headers = {
                ...details.responseHeaders,
                'X-Content-Type-Options': ['nosniff'],
                'X-Frame-Options': ['DENY'],
                'Referrer-Policy': ['strict-origin-when-cross-origin'],
                'Cross-Origin-Opener-Policy': ['same-origin'],
                'Cross-Origin-Embedder-Policy': ['require-corp']
            };
            callback({ responseHeaders: headers });
        });
    }

    // ✅ SECURITY: Generic IPC sender validator
    validateIPCSender(allowedWindows) {
        return (event) => {
            const senderId = event.sender.id;
            const allowed = allowedWindows ? allowedWindows.has(senderId) : this.trustedWindows.has(senderId);
            
            if (!allowed) {
                const url = event.sender.getURL() || 'unknown';
                console.warn(`[SECURITY] IPC blocked from: ${senderId} (${url})`);
                return false;
            }
            
            return true;
        };
    }
    
    // ✅ SECURITY: Get allowed URLs for validation
    getAllowedUrls() {
        return [...this.allowedUrls];
    }
}

module.exports = ContextSecurity;