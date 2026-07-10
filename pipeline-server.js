const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const DB_PATH = path.join(os.homedir(), '.noblehyve', 'pipeline-events.db');
const LOG_PATH = path.join(os.homedir(), '.noblehyve', 'pipeline-log.ndjson');

let server = null;
let watcher = null;
const clients = new Set();
let lastSize = 0;
let buffer = '';

function tailLog() {
    try {
        if (!fs.existsSync(LOG_PATH)) return;
        const stats = fs.statSync(LOG_PATH);
        if (stats.size < lastSize) { lastSize = 0; buffer = ''; }
        if (stats.size === lastSize) return;
        const fd = fs.openSync(LOG_PATH, 'r');
        const buf = Buffer.alloc(stats.size - lastSize);
        fs.readSync(fd, buf, 0, buf.length, lastSize);
        fs.closeSync(fd);
        lastSize = stats.size;
        buffer += buf.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                const msg = `data: ${trimmed}\n\n`;
                for (const client of clients) {
                    try { client.write(msg); } catch (_) { clients.delete(client); }
                }
            }
        }
    } catch (_) {}
}

function start(port) {
    const PORT = port || parseInt(process.env.PIPELINE_PORT || '9876', 10);
    if (server) return console.log('Pipeline server already running on port', PORT);

    watcher = setInterval(tailLog, 500);

    server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (req.url === '/events' || (req.url.startsWith('/events?') && !req.url.includes('/stream'))) {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            const limit = parseInt(url.searchParams.get('limit') || '200', 10);
            const severity = url.searchParams.get('severity') || 'all';
            res.setHeader('Content-Type', 'application/json');
            try {
                const db = new Database(DB_PATH, { readonly: true });
                let query = 'SELECT id, topic, severity, action, data, created_at FROM events';
                const params = [];
                if (severity && severity !== 'all') {
                    query += ' WHERE severity = ?';
                    params.push(severity);
                }
                query += ' ORDER BY id DESC LIMIT ?';
                params.push(limit);
                const rows = db.prepare(query).all(...params);
                db.close();
                res.end(JSON.stringify(rows, null, 2));
            } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
            }

        } else if (req.url === '/events/stream') {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.write('retry: 1000\n\n');
            clients.add(res);
            req.on('close', () => clients.delete(res));

        } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                error: 'not found',
                endpoints: {
                    'GET /events': 'Recent events from SQLite (?limit=200&severity=all|critical|normal|low)',
                    'GET /events/stream': 'SSE stream of new NDJSON log lines'
                }
            }));
        }
    });

    server.listen(PORT, () => {
        console.log(`\n  Pipeline server running at http://localhost:${PORT}`);
        console.log(`  REST:  curl http://localhost:${PORT}/events?limit=50`);
        console.log(`  SSE:   curl -N http://localhost:${PORT}/events/stream\n`);
    });
}

function stop() {
    if (watcher) { clearInterval(watcher); watcher = null; }
    for (const client of clients) {
        try { client.end(); } catch (_) {}
    }
    clients.clear();
    if (server) { server.close(); server = null; }
}

if (require.main === module) {
    start();
}

module.exports = { start, stop };
