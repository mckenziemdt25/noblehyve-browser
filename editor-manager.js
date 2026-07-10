// editor-manager.js - SECURE VERSION with path validation
const { ipcMain, app } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// ✅ SECURITY: Path validation helper (shared with terminal-manager)
function isPathAllowed(requestedPath, operation = 'read') {
    try {
        const resolved = path.resolve(requestedPath);
        
        const allowedPaths = [
            os.homedir() + '/Documents',
            os.homedir() + '/Desktop',
            os.homedir() + '/Downloads',
            app.getPath('userData'),
            app.getPath('temp'),
            process.cwd()
        ];
        
        const isAllowed = allowedPaths.some(allowed => 
            resolved.startsWith(path.resolve(allowed))
        );
        
        if (!isAllowed) {
            console.error(`[SECURITY] Editor blocked ${operation} attempt: ${requestedPath}`);
        }
        
        return isAllowed;
    } catch (error) {
        console.error(`[SECURITY] Editor path validation error: ${error.message}`);
        return false;
    }
}

class EditorManager {
    constructor() {
        this.activeEditors = new Map();
        this.setupIPCHandlers();
    }

    setupIPCHandlers() {
        // ✅ SECURITY: Read file with path validation
        ipcMain.handle('editor:read-file', async (event, filePath) => {
            if (!this.validateSender(event)) {
                return { success: false, error: 'Unauthorized' };
            }
            
            if (!isPathAllowed(filePath, 'read')) {
                return { success: false, error: 'Access denied' };
            }
            
            try {
                // ✅ SECURITY: Limit file size (max 10MB)
                const stats = await fs.stat(filePath);
                if (stats.size > 10 * 1024 * 1024) {
                    return { success: false, error: 'File too large (max 10MB)' };
                }
                
                const content = await fs.readFile(filePath, 'utf8');
                return { success: true, content };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // ✅ SECURITY: Write file with path validation
        ipcMain.handle('editor:write-file', async (event, { filePath, content }) => {
            if (!this.validateSender(event)) {
                return { success: false, error: 'Unauthorized' };
            }
            
            if (!isPathAllowed(filePath, 'write')) {
                return { success: false, error: 'Access denied' };
            }
            
            try {
                // ✅ SECURITY: Limit file size (max 10MB)
                if (content && content.length > 10 * 1024 * 1024) {
                    return { success: false, error: 'Content too large (max 10MB)' };
                }
                
                await fs.writeFile(filePath, content, 'utf8');
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // ✅ SECURITY: List files with path validation
        ipcMain.handle('editor:list-files', async (event, dirPath) => {
            if (!this.validateSender(event)) {
                return { success: false, error: 'Unauthorized' };
            }
            
            if (!isPathAllowed(dirPath, 'list')) {
                return { success: false, error: 'Access denied' };
            }
            
            try {
                const files = await fs.readdir(dirPath);
                // ✅ SECURITY: Limit number of files
                const limitedFiles = files.slice(0, 100);
                return { success: true, files: limitedFiles };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // ✅ SECURITY: Create file with path validation
        ipcMain.handle('editor:create-file', async (event, { filePath, content }) => {
            if (!this.validateSender(event)) {
                return { success: false, error: 'Unauthorized' };
            }
            
            if (!isPathAllowed(filePath, 'create')) {
                return { success: false, error: 'Access denied' };
            }
            
            try {
                await fs.writeFile(filePath, content || '', 'utf8');
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // ✅ SECURITY: Delete file with path validation
        ipcMain.handle('editor:delete-file', async (event, filePath) => {
            if (!this.validateSender(event)) {
                return { success: false, error: 'Unauthorized' };
            }
            
            if (!isPathAllowed(filePath, 'delete')) {
                return { success: false, error: 'Access denied' };
            }
            
            try {
                await fs.unlink(filePath);
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
    }
    
    // ✅ SECURITY: Validate IPC sender
    validateSender(event) {
        const sender = event.sender;
        const url = sender.getURL();
        
        // Only allow from editor.html
        const isAllowed = url.includes('editor.html');
        
        if (!isAllowed) {
            console.warn(`[SECURITY] Editor IPC blocked from: ${url}`);
            return false;
        }
        
        return true;
    }
}

module.exports = EditorManager;