// test-crypto-basic.js - Test if CryptoJS is working
const CryptoJS = require('crypto-js');

console.log('Testing CryptoJS...');

// Test 1: Simple encryption
try {
    const message = "Hello World";
    const password = "test123";
    
    console.log('Original:', message);
    
    const encrypted = CryptoJS.AES.encrypt(message, password);
    console.log('Encrypted:', encrypted.toString());
    
    const decrypted = CryptoJS.AES.decrypt(encrypted, password);
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    console.log('Decrypted:', result);
    
    if (result === message) {
        console.log('✅ Basic encryption works!');
    } else {
        console.log('❌ Basic encryption failed');
    }
} catch (err) {
    console.error('Error:', err.message);
}