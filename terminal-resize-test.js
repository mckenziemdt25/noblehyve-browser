// Terminal Resize & Scroll Test
// Run this in the NobleHyve Terminal to check if the terminal panel
// adjusts properly when resized.
//
// How to test:
// 1. Run: node terminal-resize-test.js
// 2. Drag the terminal panel border up/down to resize it
// 3. The grid below should reflow properly
// 4. Output should wrap correctly at the new terminal width

const COLS = process.stdout.columns || 80;
const ROWS = process.stdout.rows || 24;

console.log('');
console.log('='.repeat(Math.min(COLS, 100)));
console.log(' TERMINAL RESIZE TEST');
console.log('='.repeat(Math.min(COLS, 100)));
console.log('');
console.log(` Current terminal size: ${COLS} cols x ${ROWS} rows`);
console.log('');

// Print a ruler to visually verify column width
let ruler = '';
for (let i = 1; i <= Math.min(COLS, 100); i++) {
    ruler += (i % 10 === 0) ? Math.floor(i / 10) : (i % 5 === 0) ? '+' : '-';
}
console.log(' Width ruler (each digit = 10 cols):');
console.log(ruler);
console.log('');

// Generate enough lines to test scrolling (fill more than 1 screen)
console.log(' Scroll test: outputting 50 lines to test scrollbar:');
for (let i = 1; i <= 50; i++) {
    const bar = '█'.repeat(Math.min(i, COLS - 10));
    const pct = String(Math.round(i / 50 * 100)).padStart(3);
    console.log(` Line ${String(i).padStart(2)}: [${pct}%] ${bar}`);
}
console.log('');

console.log(' Done. Now:');
console.log(' 1. Scroll up/down with the scrollbar or mouse wheel');
console.log(' 2. Resize the terminal panel and re-run to see new dimensions');
console.log('');

// Listen for SIGWINCH (resize events on Linux/Mac)
if (process.stdin.isTTY) {
    process.stdout.on('resize', () => {
        const newCols = process.stdout.columns;
        const newRows = process.stdout.rows;
        console.log(`\n 🔄 Terminal resized to ${newCols}x${newRows}\n`);
    });
}
