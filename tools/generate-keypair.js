// generate-keypair.js
// Run ONCE as the developer to create your RSA key pair.
// The public key gets embedded into license-manager.js.
// KEEP private.pem SECRET — never commit it.
//
// Usage: node tools/generate-keypair.js

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const toolsDir = __dirname;
const rootDir = path.resolve(toolsDir, '..');
const privatePath = path.join(toolsDir, 'private.pem');

fs.writeFileSync(privatePath, privateKey, 'utf8');
console.log('✅ Private key saved to tools/private.pem — KEEP SECRET, never commit');

const pubB64 = publicKey
    .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '')
    .replace(/\n/g, '')
    .trim();

const lmPath = path.join(rootDir, 'license-manager.js');
let lm = fs.readFileSync(lmPath, 'utf8');

const pubPem = `-----BEGIN PUBLIC KEY-----\n${pubB64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;

// Replace the EMBEDDED_PUBLIC_KEY = null line with the actual key
lm = lm.replace(
    /const EMBEDDED_PUBLIC_KEY = null;/,
    `const EMBEDDED_PUBLIC_KEY = \`${pubPem}\`;`
);

fs.writeFileSync(lmPath, lm, 'utf8');
console.log('✅ Public key embedded into license-manager.js');

console.log('\n📋 Next step: run node tools/generate-license.js <key-id>');
console.log('    where <key-id> is a unique identifier (e.g. user email or UUID)');
