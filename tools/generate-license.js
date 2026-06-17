// generate-license.js
// Generates a signed license key using the private key.
//
// Usage: node tools/generate-license.js <optional-customer-id>
//
// Example: node tools/generate-license.js user@example.com
//          node tools/generate-license.js  (generates a random ID)

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const privatePath = path.join(__dirname, 'private.pem');
if (!fs.existsSync(privatePath)) {
    console.error('❌ private.pem not found. Run node tools/generate-keypair.js first.');
    process.exit(1);
}

const privateKey = fs.readFileSync(privatePath, 'utf8');
const customerId = process.argv[2] || crypto.randomUUID();

const licenseKey = `NOBLEHYVE-${customerId}`;
const sign = crypto.createSign('RSA-SHA256');
sign.update(licenseKey);
const signature = sign.sign(privateKey, 'base64url');

const fullKey = `${licenseKey}.${signature}`;
console.log(`\n🔑 License key:\n${fullKey}\n`);
console.log(`Customer ID: ${customerId}`);
console.log(`Signature length: ${signature.length} chars`);

const outPath = path.join(__dirname, 'last-license.txt');
fs.writeFileSync(outPath, fullKey, 'utf8');
console.log(`\n📄 Also saved to: ${outPath}`);
