// terminal-manager.js - Complete PTY version with pipeline telemetry
const { ipcMain, app } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');
const pipeline = require('./kafka-pipeline');

class TerminalManager {
    constructor(openTerminalFn) {
        this.sessions = new Map();
        this._openTerminalFn = openTerminalFn || null;
        this._pendingResolvers = new Map();
        this._sessionMeta = new Map();
        this._cwdIntervals = new Map();
        this.setupIPCHandlers();
        console.log('TerminalManager initialized on:', os.platform());
    }

    _getDefaultShell() {
        if (process.platform === 'win32') {
            return { shell: 'powershell.exe', args: ['-NoLogo', '-ExecutionPolicy', 'RemoteSigned'] };
        } else if (process.platform === 'darwin') {
            return { shell: '/bin/zsh', args: [] };
        }
        const userShell = process.env.SHELL || '/bin/bash';
        return { shell: userShell, args: [] };
    }

    _resolveCwd(pid) {
        try {
            if (process.platform === 'linux') {
                const cwd = fs.realpathSync(`/proc/${pid}/cwd`);
                return cwd || null;
            } else if (process.platform === 'darwin') {
                const output = require('child_process').execSync(`lsof -p ${pid} -Fn | grep '^fcwd' | head -1`).toString();
                const match = output.match(/^fcwd(.+)/);
                return match ? match[1].trim() : null;
            }
            return null;
        } catch {
            return null;
        }
    }

    _startCwdPolling(sessionId, pid, eventSender) {
        if (this._cwdIntervals.has(sessionId)) return;
        const interval = setInterval(() => {
            const cwd = this._resolveCwd(pid);
            if (cwd) {
                const meta = this._sessionMeta.get(sessionId);
                if (meta && meta.cwd !== cwd) {
                    meta.cwd = cwd;
                    if (eventSender && !eventSender.isDestroyed()) {
                        eventSender.send('terminal:cwd-changed', { id: sessionId, cwd });
                    }
                }
            }
        }, 1000);
        this._cwdIntervals.set(sessionId, interval);
    }

    _stopCwdPolling(sessionId) {
        const interval = this._cwdIntervals.get(sessionId);
        if (interval) {
            clearInterval(interval);
            this._cwdIntervals.delete(sessionId);
        }
    }

    setupIPCHandlers() {
        // Create PTY session
        ipcMain.handle('terminal:create', async (event, { id, shell, cwd, cols, rows }) => {
            const start = Date.now();
            try {
                console.log('Creating terminal session:', id);

                const defaultCfg = this._getDefaultShell();
                const terminalShell = defaultCfg.shell;
                const shellArgs = defaultCfg.args;

                let workingDir = cwd || os.homedir();
                const ptyCols = cols || 120;
                const ptyRows = rows || 30;

                const ptyProcess = pty.spawn(terminalShell, shellArgs, {
                    name: 'xterm-256color',
                    cols: ptyCols,
                    rows: ptyRows,
                    cwd: workingDir,
                    env: {
                        ...process.env,
                        TERM: 'xterm-256color',
                        COLORTERM: 'truecolor'
                    }
                });

                this.sessions.set(id, ptyProcess);
                this._sessionMeta.set(id, { shell: terminalShell, cwd: workingDir, pid: ptyProcess.pid });

                const resolver = this._pendingResolvers.get(id);
                if (resolver) { resolver(); this._pendingResolvers.delete(id); }
                pipeline.terminal({ action: 'session-created', id, shell: terminalShell, elapsedMs: Date.now() - start });

                this._startCwdPolling(id, ptyProcess.pid, event.sender);

                ptyProcess.onData((data) => {
                    if (!event.sender.isDestroyed()) {
                        event.sender.send('terminal:data', { id, data });
                    }
                });

                ptyProcess.onExit(({ exitCode, signal }) => {
                    this._stopCwdPolling(id);
                    pipeline.terminal({ action: 'session-exit', id, exitCode, signal, uptimeMs: Date.now() - start });
                    if (!event.sender.isDestroyed()) {
                        event.sender.send('terminal:exit', { id, exitCode, signal });
                    }
                    this.sessions.delete(id);
                    this._sessionMeta.delete(id);
                });

                return { success: true, pid: ptyProcess.pid, shell: terminalShell };

            } catch (error) {
                console.error('Terminal creation error:', error);
                pipeline.terminal({ action: 'session-error', id, error: error.message, elapsedMs: Date.now() - start });
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
                this._stopCwdPolling(id);
                this._sessionMeta.delete(id);
            }
        });
        
        // Get current working directory for a session
        ipcMain.handle('terminal:get-cwd', async (event, id) => {
            const sessionId = id || 'main';
            const meta = this._sessionMeta.get(sessionId);
            if (meta && meta.cwd) {
                return { success: true, path: meta.cwd };
            }
            const session = this.sessions.get(sessionId);
            if (session && !session.killed) {
                const resolved = this._resolveCwd(session.pid);
                if (resolved) {
                    if (meta) meta.cwd = resolved;
                    return { success: true, path: resolved };
                }
            }
            return { success: true, path: this._workspaceDir || process.cwd() };
        });

        // Editor integration: send code to terminal
        ipcMain.handle('editor:send-to-terminal', async (event, { code, cwd }) => {
            const start = Date.now();
            const ready = await this.ensureSession('main', 10000);
            if (!ready) {
                return { success: false, error: 'Terminal session could not be started' };
            }
            const ok = this.sendToMainSession(code, cwd);
            pipeline.terminal({ action: 'code-execution', codeLen: code.length, cwd: cwd || '', elapsedMs: Date.now() - start });
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

    ensureSession(id, timeoutMs = 8000) {
        return new Promise((resolve) => {
            const session = this.sessions.get(id);
            if (session && !session.killed) {
                resolve(true);
                return;
            }
            if (this._pendingResolvers.has(id)) {
                resolve(false);
                return;
            }
            this._pendingResolvers.set(id, () => {
                clearTimeout(timer);
                resolve(true);
            });
            if (this._openTerminalFn) {
                this._openTerminalFn();
            }
            const timer = setTimeout(() => {
                this._pendingResolvers.delete(id);
                resolve(false);
            }, timeoutMs);
        });
    }

    killAllSessions() {
        for (const [id, session] of this.sessions) {
            if (!session.killed) {
                try {
                    session.kill();
                    pipeline.terminal({ action: 'session-killed', id });
                } catch (err) {
                    console.error('Error killing session:', err);
                }
            }
            this._stopCwdPolling(id);
            this._sessionMeta.delete(id);
        }
        this.sessions.clear();
        this._workspaceDir = null;
    }
}

module.exports = TerminalManager;