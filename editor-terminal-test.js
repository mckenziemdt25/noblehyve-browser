// Editor ↔ Terminal Integration Test
// Step 1: Open this file in the NobleHyve Editor (Ctrl+E or Editor button)
// Step 2: Open the Terminal (Ctrl+T or Terminal button)
// Step 3: Run: node editor-terminal-test.js
// If both work together properly, the server will start on port 3000

const http = require('http');
const os = require('os');

const PORT = 3000;

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
<!DOCTYPE html>
<html>
<head><title>NobleHyve Integration Test</title></head>
<body style="font-family:Segoe UI,sans-serif;background:#1e1e1e;color:#d4d4d4;padding:40px;">
    <h1 style="color:#569cd6;">✅ Editor + Terminal Integration Working</h1>
    <p>This file was written in the <strong>NobleHyve Editor</strong></p>
    <p>And is now running via the <strong>NobleHyve Terminal</strong></p>
    <hr style="border-color:#333;">
    <h2>System Info</h2>
    <ul>
        <li>Platform: ${os.platform()}</li>
        <li>Hostname: ${os.hostname()}</li>
        <li>CPUs: ${os.cpus().length}</li>
        <li>Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB</li>
        <li>Uptime: ${Math.round(os.uptime() / 60)} min</li>
    </ul>
    <h2>Test Checklist</h2>
    <ul>
        <li>✓ Open file in Editor</li>
        <li>✓ Run in Terminal</li>
        <li>✓ Server starts successfully</li>
        <li><a href="http://localhost:${PORT}/test" style="color:#4ec9b0;">Click here for next test</a></li>
    </ul>
</body>
</html>
        `);
    } else if (req.url === '/test') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Terminal resize test: resize this terminal window and the text should reflow properly.\n');
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`\n  🟢 Integration test server running!`);
    console.log(`  ├─ Open http://localhost:${PORT} in the NobleHyve browser tab`);
    console.log(`  ├─ Edit this file in the editor and re-run to test edit→run workflow`);
    console.log(`  └─ Press Ctrl+C in the terminal to stop the server\n`);
});
