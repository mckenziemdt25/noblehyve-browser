const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB_PATH = path.join(os.homedir(), '.noblehyve', 'pipeline-events.db');
const LOG_PATH = path.join(os.homedir(), '.noblehyve', 'pipeline-log.ndjson');

let db;
let logStream;

function classify(topic, data) {
    const action = (data && data.action) || '';
    if (topic === 'crashes') return 'critical';
    if (action === 'tab-crashed' || action === 'navigation-error') return 'critical';
    if (action === 'heartbeat' || action === 'performance-metrics') return 'low';
    return 'normal';
}

function ttlDays(severity) {
    if (severity === 'critical') return Infinity;
    if (severity === 'low') return 1;
    return 1;
}

function init() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'normal',
            action TEXT,
            data TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );
        CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
        CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
        CREATE INDEX IF NOT EXISTS idx_events_topic ON events(topic);
    `);

    logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

    cleanup();
}

function insert(topic, data) {
    const severity = classify(topic, data);
    const action = (data && data.action) || '';

    const stmt = db.prepare('INSERT INTO events (topic, severity, action, data) VALUES (?, ?, ?, ?)');
    stmt.run(topic, severity, action, JSON.stringify(data));

    const logLine = JSON.stringify({ topic, severity, action, data, timestamp: new Date().toISOString() }) + '\n';
    logStream.write(logLine);

    if (severity === 'critical') {
        db.prepare('UPDATE events SET severity = ? WHERE id = ?').run('critical', stmt.lastInsertRowid);
    }
}

function cleanup() {
    const now = Math.floor(Date.now() / 1000);
    const day24 = 24 * 3600;

    const deleted = db.prepare(
        'DELETE FROM events WHERE severity != ? AND created_at < ?'
    ).run('critical', now - day24);

    if (deleted.changes > 0) {
        console.log(`PipelineStore: purged ${deleted.changes} expired events`);
    }
}

function getRecent(limit = 200, severityFilter) {
    let query = 'SELECT * FROM events';
    const params = [];
    if (severityFilter && severityFilter !== 'all') {
        query += ' WHERE severity = ?';
        params.push(severityFilter);
    }
    query += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);
    return db.prepare(query).all(...params);
}

function getCounts() {
    return db.prepare(`
        SELECT topic, severity, COUNT(*) as count FROM events
        WHERE created_at > strftime('%s','now') - 86400
        GROUP BY topic, severity
    `).all();
}

function exportJson(severityFilter) {
    let query = 'SELECT * FROM events';
    const params = [];
    if (severityFilter && severityFilter !== 'all') {
        query += ' WHERE severity = ?';
        params.push(severityFilter);
    }
    query += ' ORDER BY id ASC';
    return db.prepare(query).all(...params);
}

function close() {
    if (logStream) logStream.end();
    if (db) db.close();
}

module.exports = { init, insert, getRecent, getCounts, exportJson, cleanup, close };
