// terminal-manager.js - Complete PTY version
const { ipcMain, app } = require('electron');
const os = require('os');
const path = require('path');
const pty = require('node-pty');

class TerminalManager {
    constructor() {
        this.sessions = new Map();
        this.setupIPCHandlers();
        console.log('TerminalManager initialized on:', os.platform());
    }

    setupIPCHandlers() {
        // Create PTY session
        ipcMain.handle('terminal:create', async (event, { id, shell, cwd }) => {
            try {
                console.log('Creating terminal session:', id);
                
                let terminalShell = shell;
                let shellArgs = [];
                
                if (!terminalShell) {
                    if (process.platform === 'win32') {
                        terminalShell = 'powershell.exe';
                        shellArgs = ['-NoLogo', '-ExecutionPolicy', 'RemoteSigned'];
                    } else if (process.platform === 'darwin') {
                        terminalShell = '/bin/zsh';
                    } else {
                        terminalShell = '/bin/bash';
                    }
                }
                
                let workingDir = cwd || os.homedir();
                
                const ptyProcess = pty.spawn(terminalShell, shellArgs, {
                    name: 'xterm-256color',
                    cols: 120,
                    rows: 30,
                    cwd: workingDir,
                    env: {
                        ...process.env,
                        TERM: 'xterm-256color',
                        COLORTERM: 'truecolor',
                        SYSTEMROOT: process.env.SYSTEMROOT,
                        COMSPEC: process.env.COMSPEC || 'cmd.exe'
                    }
                });
                
                this.sessions.set(id, ptyProcess);
                
                ptyProcess.onData((data) => {
                    if (!event.sender.isDestroyed()) {
                        event.sender.send('terminal:data', { id, data });
                    }
                });
                
                ptyProcess.onExit(({ exitCode, signal }) => {
                    if (!event.sender.isDestroyed()) {
                        event.sender.send('terminal:exit', { id, exitCode, signal });
                    }
                    this.sessions.delete(id);
                });
                
                return { success: true, pid: ptyProcess.pid };
                
            } catch (error) {
                console.error('Terminal creation error:', error);
                return { success: false, error: error.message };
            }
        });
        
        // Write to PTY
        ipcMain.on('terminal:write', (event, { id, data }) => {
            const session = this.sessions.get(id);
            if (session && !session.killed) {
                try {
                    session.write(data);
                } catch (err) {
                    console.error('Write error:', err);
                }
            }
        });
        
        // Resize PTY
        ipcMain.on('terminal:resize', (event, { id, cols, rows }) => {
            const session = this.sessions.get(id);
            if (session && !session.killed) {
                try {
                    session.resize(cols, rows);
                } catch (err) {
                    console.error('Resize error:', err);
                }
            }
        });
        
        // Kill PTY
        ipcMain.on('terminal:kill', (event, id) => {
            const session = this.sessions.get(id);
            if (session && !session.killed) {
                try {
                    session.kill();
                } catch (err) {
                    console.error('Kill error:', err);
                }
                this.sessions.delete(id);
            }
        });
        
        // Get current working directory
        ipcMain.handle('terminal:get-cwd', async () => {
            return { success: true, path: this._workspaceDir || process.cwd() };
        });

        // Editor integration: send code to terminal
        ipcMain.handle('editor:send-to-terminal', async (event, { code, cwd }) => {
            const ok = this.sendToMainSession(code, cwd);
            return { success: ok };
        });

        // Editor integration: set workspace for shared state
        ipcMain.handle('editor:set-workspace', async (event, { dir }) => {
            this.setWorkspace(dir);
            return { success: true };
        });

        // Editor integration: get workspace
        ipcMain.handle('editor:get-workspace', async () => {
            return { success: true, dir: this.getWorkspace() };
        });
        
        // System info
        ipcMain.handle('terminal:system-info', async () => {
            return {
                platform: os.platform(),
                release: os.release(),
                cpus: os.cpus().length,
                hostname: os.hostname(),
                homedir: os.homedir()
            };
        });
        
        // Download file (for the button)
        ipcMain.handle('terminal:download', async (event, { url, filename, cwd }) => {
            return new Promise((resolve) => {
                const https = require('https');
                const http = require('http');
                const fs = require('fs');
                const path = require('path');
                const urlModule = require('url');
                
                try {
                    const parsedUrl = urlModule.parse(url);
                    const protocol = parsedUrl.protocol === 'https:' ? https : http;
                    
                    let saveFilename = filename || path.basename(parsedUrl.pathname) || 'download';
                    const targetDir = cwd || process.cwd();
                    let finalPath = path.join(targetDir, saveFilename);
                    let counter = 1;
                    
                    while (fs.existsSync(finalPath)) {
                        const ext = path.extname(saveFilename);
                        const base = saveFilename.slice(0, -ext.length);
                        finalPath = path.join(targetDir, `${base}_${counter}${ext}`);
                        counter++;
                    }
                    
                    const file = fs.createWriteStream(finalPath);
                    
                    const request = protocol.get(url, (response) => {
                        if (response.statusCode !== 200) {
                            resolve({ success: false, error: `HTTP ${response.statusCode}` });
                            return;
                        }
                        
                        response.pipe(file);
                        
                        file.on('finish', () => {
                            file.close();
                            const stats = fs.statSync(finalPath);
if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-complete', { filePath: finalPath, size: stats.size });
}
                            resolve({ success: true, filePath: finalPath });
                        });
                        
                        file.on('error', (err) => {
                            fs.unlink(finalPath, () => {});
                            resolve({ success: false, error: err.message });
                        });
                    });
                    
                    request.on('error', (err) => {
                        fs.unlink(finalPath, () => {});
                        resolve({ success: false, error: err.message });
                    });
                    
                } catch (error) {
                    resolve({ success: false, error: error.message });
                }
            });
        });
    }
    
    // ── Public methods for editor integration ────────────────────────────────
    getSession(id) {
        return this.sessions.get(id) || null;
    }

    writeToSession(id, data) {
        const session = this.sessions.get(id);
        if (session && !session.killed) {
            try {
                session.write(data);
                return true;
            } catch (err) {
                console.error('Write to session error:', err);
                return false;
            }
        }
        return false;
    }

    // Shared workspace state — editor can set, terminal can read
    setWorkspace(dir) {
        this._workspaceDir = dir;
    }

    getWorkspace() {
        return this._workspaceDir || null;
    }

    // Write to the default 'main' session with optional cd first
    sendToMainSession(code, cwd) {
        let fullCmd = '';
        if (cwd) {
            this.setWorkspace(cwd);
            if (process.platform === 'win32') {
                fullCmd += `cd /d "${cwd}"\r\n`;
            } else {
                fullCmd += `cd "${cwd}"\r\n`;
            }
        }
        fullCmd += code;
        if (!fullCmd.endsWith('\n')) fullCmd += '\n';
        return this.writeToSession('main', fullCmd);
    }

    killAllSessions() {
        for (const [id, session] of this.sessions) {
            if (!session.killed) {
                try {
                    session.kill();
                } catch (err) {
                    console.error('Error killing session:', err);
                }
            }
        }
        this.sessions.clear();
        this._workspaceDir = null;
    }
}

module.exports = TerminalManager;