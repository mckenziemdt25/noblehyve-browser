# NobleHyve Browser — Session Memory

## What This App Does
Secure Electron-based browser with an embedded code editor, encrypted local/cloud file storage, and a VS Code-style bottom panel with terminal + output.

## Architecture

### Core Files
| File | Role |
|------|------|
| `main.js` | Electron main process — windows, IPC handlers, terminal manager, encrypted file ops, pipeline |
| `preload.js` | Browser window preload (terminal, pipeline dashboard, context menu) |
| `preload-editor.js` | Editor window preload — file I/O, encryption, terminal IPC, cloud |
| `preload-terminal.js` | Terminal window preload |
| `editor.html` | The code editor page — CodeMirror, xterm.js bottom panel, all UI + JS |
| `terminal-manager.js` | PTY session management (node-pty), ensureSession(), editor send-to-terminal |
| `kafka-pipeline.js` | Telemetry pipeline — Kafka producer + SQLite store fallback |
| `pipeline-store.js` | Local SQLite store (`~/.noblehyve/pipeline-events.db`) + NDJSON log |
| `pipeline-server.js` | HTTP server for Jupyter/SSE access to pipeline data (port 9876) |
| `encryption.js` | Crypto helper for encrypt/decrypt |
| `cloudflare.js` | Cloudflare R2 storage for cloud file save/restore |

### Windows
- **Browser window** (`preload.js`): main browsing UI with tabs
- **Editor window** (`preload-editor.js`): code editor with terminal + output panel
- **Terminal window** (`preload-terminal.js`): standalone terminal (separate from embedded one)

## Bottom Panel (Editor)
- Toolbar button "🖥️ Terminal" toggles panel
- Two tabs: **Terminal** (xterm.js with PTY via `terminal:create` IPC) and **Output** (stdout/stderr from Run button)
- Resize handle between editor and panel (8px tall, drag to resize)
- Panel opens automatically when code produces output (via `appendOutput()`)
- Close button (✕) hides panel
- **Terminal session ID**: `editor-terminal` (separate from main window's `main` session)

### Terminal Data Flow
```
PTY → terminal-manager.js onData → event.sender.send('terminal:data')
→ preload-editor.js onTerminalData handler → xterm.write(data)
User input → xterm.onData → preload writeToTerminal → IPC terminal:write → session.write(data)
```

### Resize Flow (debounced)
```
Panel drag → ResizeObserver (100ms debounce) → fitAddon.fit()
→ xterm.onResize (150ms debounce) → IPC resizeTerminal → PTY session.resize(cols, rows)
```

## Encrypted Files
- **Save**: toolbar "🔒 Encrypt" → filename input + password × 2 → `save-encrypted-file` IPC → saves to Desktop as `.enc`
- **Open**: toolbar "🔓 Decrypt" → file picker lists `.enc` files from Desktop → password → `read-encrypted-file` IPC → decrypts + opens in tab
- Both modals use `.encrypt-save` CSS class (dark gradient + floating hex codes)
- Open flow uses `list-encrypted-files` IPC (scans Desktop for `*.enc`)

## Cloud Storage (R2)
- **Save**: "☁️ Cloud" → filename input + password × 2 → encrypt content → upload to R2
- **Restore**: "📥 Restore" → cloud file picker (searchable list) → password → download + decrypt
- Modals use `.cloud-save` CSS class (sky gradient + animated cloud shapes)
- `loadCloudFiles()` / `loadUsageStatus()` called on init

## Pipeline / Telemetry
- All events stored in `~/.noblehyve/pipeline-events.db` (SQLite) and `~/.noblehyve/pipeline-log.ndjson`
- Kafka optional — Docker not required
- Topics: `editor`, `terminal`, `crashes`
- Optional HTTP server (port 9876) for Jupyter access:
  - `GET /events?limit=200&severity=all` — REST query
  - `GET /events/stream` — SSE real-time stream
  - Start with `npm run pipeline` or `npm run start-with-pipeline`

## Toolbar Buttons
| Button | Action |
|--------|--------|
| 📄 New | New tab |
| 💾 Save | Save current file |
| 📂 Open | Native file dialog |
| ▶️ Run | Execute code in-process |
| 👁️ Preview | HTML preview overlay |
| ⏹ Stop | Stop execution |
| 🔒 Encrypt | Save as encrypted .enc |
| 🔓 Decrypt | Open encrypted .enc file |
| ☁️ Cloud | Upload to R2 |
| 📥 Restore | Download from R2 |
| 🔄 | Refresh cloud file list |
| 🖥️ Terminal | Toggle bottom panel |
| 🔧 DevTools | Toggle editor DevTools |

## Next Steps / Ideas
- [ ] Add `electron-builder` config for distribution (installer, icon, auto-update)
- [ ] Branding: logo, app name, landing page on Cloudflare Pages
- [ ] Testing: GitHub Actions + Playwright for Electron
- [ ] The cloud restore .enc files are not any less secure than the local ones — they use the same encryption
- [ ] The open-source version could expose a limited "Pipeline Log" tab for debugging
