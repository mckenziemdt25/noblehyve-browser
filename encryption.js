// encryption.js - SECURE VERSION with 600,000 iterations
const CryptoJS = require('crypto-js');
const { randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');

class EncryptionManager {
    constructor() {
        this.dataPath = this.getDataPath();
        
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
            console.log('📁 Created encrypted data directory:', this.dataPath);
        }
        
        this.failedAttempts = new Map();
        this.maxAttempts = 5;
        this.lockoutTime = 15 * 60 * 1000;
        
        // ✅ SECURITY: Modern iteration count (OWASP 2024 recommendation)
        this.pbkdf2Iterations = 600000;  // Was 10000 - now 60x stronger!
    }
    
    getDataPath() {
        try {
            const { app } = require('electron');
            const userDataPath = app.getPath('userData');
            return path.join(userDataPath, 'encrypted_data');
        } catch (error) {
            console.log('Running in Node.js mode (using local directory)');
            return path.join(process.cwd(), 'test_encrypted_data');
        }
    }
    
    // ✅ SECURITY: Strong key derivation with 600,000 iterations
    generateKeyFromPassword(password, salt = null) {
        if (!salt) {
            salt = CryptoJS.lib.WordArray.random(128 / 8);
        }
        
        const startTime = Date.now();
        console.log(`🔐 Deriving key with ${this.pbkdf2Iterations} iterations...`);
        
        const key = CryptoJS.PBKDF2(password, salt, {
            keySize: 256 / 32,
            iterations: this.pbkdf2Iterations,  // ✅ 600,000 iterations
            hasher: CryptoJS.algo.SHA256
        });
        
        const elapsed = Date.now() - startTime;
        console.log(`✅ Key derived in ${elapsed}ms`);
        
        return { key, salt: salt.toString() };
    }
    
    isLockedOut(userId = 'default') {
        const attempts = this.failedAttempts.get(userId) || { count: 0, lastAttempt: 0 };
        const now = Date.now();
        
        if (attempts.count >= this.maxAttempts) {
            if (now - attempts.lastAttempt < this.lockoutTime) {
                const remaining = Math.ceil((this.lockoutTime - (now - attempts.lastAttempt)) / 1000 / 60);
                throw new Error(`Too many failed attempts. Locked out for ${remaining} minutes.`);
            } else {
                this.failedAttempts.delete(userId);
            }
        }
        return false;
    }
    
    recordFailedAttempt(userId = 'default') {
        const attempts = this.failedAttempts.get(userId) || { count: 0, lastAttempt: 0 };
        attempts.count++;
        attempts.lastAttempt = Date.now();
        this.failedAttempts.set(userId, attempts);
    }
    
    clearFailedAttempts(userId = 'default') {
        this.failedAttempts.delete(userId);
    }
    
    // ✅ SECURITY: Encryption with strong parameters
    encryptData(data, password) {
        try {
            if (!data) throw new Error('No data to encrypt');
            if (!password) throw new Error('Password required for encryption');
            
            const salt = CryptoJS.lib.WordArray.random(128 / 8);
            const iv = CryptoJS.lib.WordArray.random(128 / 8);
            
            const { key } = this.generateKeyFromPassword(password, salt);
            
            const encrypted = CryptoJS.AES.encrypt(data, key, {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });
            
            const result = {
                version: '2.0',  // Version bump to indicate stronger encryption
                algorithm: 'AES-256-CBC',
                iterations: this.pbkdf2Iterations,  // Store iterations for future compatibility
                salt: salt.toString(),
                iv: iv.toString(),
                encrypted: encrypted.toString(),
                timestamp: new Date().toISOString()
            };
            
            return JSON.stringify(result);
        } catch (error) {
            console.error('Encryption failed:', error);
            throw new Error(`Failed to encrypt data: ${error.message}`);
        }
    }
    
    // ✅ SECURITY: Decryption with iteration count from file
    decryptData(encryptedData, password) {
        try {
            if (!encryptedData) throw new Error('No encrypted data provided');
            if (!password) throw new Error('Password required for decryption');
            
            const data = JSON.parse(encryptedData);
            
            const salt = CryptoJS.enc.Hex.parse(data.salt);
            const iv = CryptoJS.enc.Hex.parse(data.iv);
            
            // Use iterations from file (backward compatible) or default to new standard
            const iterations = data.iterations || this.pbkdf2Iterations;
            
            const key = CryptoJS.PBKDF2(password, salt, {
                keySize: 256 / 32,
                iterations: iterations,
                hasher: CryptoJS.algo.SHA256
            });
            
            const decrypted = CryptoJS.AES.decrypt(data.encrypted, key, {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });
            
            const result = decrypted.toString(CryptoJS.enc.Utf8);
            
            if (!result) {
                throw new Error('Decryption failed - likely incorrect password');
            }
            
            return result;
        } catch (error) {
            console.error('Decryption failed:', error.message);
            return null;
        }
    }
    
    sanitizeFilename(filename) {
        let safe = filename.replace(/\.\./g, '')
                          .replace(/\//g, '_')
                          .replace(/\\/g, '_')
                          .replace(/[^a-zA-Z0-9_\-.]/g, '_')
                          .trim();
        
        if (safe.length === 0) safe = 'untitled';
        if (safe.length > 100) safe = safe.substring(0, 100);
        
        return safe;
    }
    
    saveEncryptedFile(filename, content, password) {
        try {
            if (!filename) throw new Error('Filename required');
            if (!content) throw new Error('Content required');
            if (!password) throw new Error('Password required');
            
            const safeFilename = this.sanitizeFilename(filename);
            const filePath = path.join(this.dataPath, `${safeFilename}.encrypted`);
            
            const encrypted = this.encryptData(content, password);
            fs.writeFileSync(filePath, encrypted, 'utf8');
            
            console.log(`✅ File encrypted and saved: ${safeFilename}`);
            return {
                success: true,
                filename: safeFilename,
                path: filePath,
                size: Buffer.byteLength(encrypted, 'utf8')
            };
        } catch (error) {
            console.error('Failed to save encrypted file:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    loadEncryptedFile(filename, password) {
        try {
            if (!filename) throw new Error('Filename required');
            if (!password) throw new Error('Password required');
            
            this.isLockedOut();
            
            const safeFilename = this.sanitizeFilename(filename);
            const filePath = path.join(this.dataPath, `${safeFilename}.encrypted`);
            
            if (!fs.existsSync(filePath)) {
                this.recordFailedAttempt();
                return {
                    success: false,
                    error: 'File not found'
                };
            }
            
            const encrypted = fs.readFileSync(filePath, 'utf8');
            const decrypted = this.decryptData(encrypted, password);
            
            if (decrypted === null) {
                this.recordFailedAttempt();
                return {
                    success: false,
                    error: 'Invalid password or corrupted file'
                };
            }
            
            this.clearFailedAttempts();
            
            console.log(`✅ File decrypted: ${safeFilename}`);
            return {
                success: true,
                content: decrypted,
                filename: safeFilename
            };
        } catch (error) {
            console.error('Failed to load encrypted file:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    listEncryptedFiles() {
        try {
            if (!fs.existsSync(this.dataPath)) {
                return { success: true, files: [] };
            }
            
            const files = fs.readdirSync(this.dataPath);
            const decryptedFiles = files
                .filter(file => file.endsWith('.encrypted'))
                .map(file => {
                    const filePath = path.join(this.dataPath, file);
                    const stats = fs.statSync(filePath);
                    
                    return {
                        name: file.replace('.encrypted', ''),
                        size: stats.size,
                        modified: stats.mtime,
                        created: stats.birthtime
                    };
                })
                .sort((a, b) => b.modified - a.modified);
            
            return {
                success: true,
                files: decryptedFiles
            };
        } catch (error) {
            console.error('Failed to list encrypted files:', error);
            return {
                success: false,
                error: error.message,
                files: []
            };
        }
    }
    
    deleteEncryptedFile(filename) {
        try {
            const safeFilename = this.sanitizeFilename(filename);
            const filePath = path.join(this.dataPath, `${safeFilename}.encrypted`);
            
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`✅ File deleted: ${safeFilename}`);
                return { success: true };
            }
            return { success: false, error: 'File not found' };
        } catch (error) {
            console.error('Failed to delete encrypted file:', error);
            return { success: false, error: error.message };
        }
    }
    
    getStorageInfo() {
        try {
            const files = this.listEncryptedFiles();
            let totalSize = 0;
            
            if (files.success) {
                totalSize = files.files.reduce((sum, file) => sum + file.size, 0);
            }
            
            return {
                totalFiles: files.files?.length || 0,
                totalSizeBytes: totalSize,
                totalSizeKB: Math.round(totalSize / 1024),
                totalSizeMB: Math.round(totalSize / (1024 * 1024)),
                dataPath: this.dataPath,
                pbkdf2Iterations: this.pbkdf2Iterations  // Show iteration count in info
            };
        } catch (error) {
            return {
                totalFiles: 0,
                totalSizeBytes: 0,
                error: error.message
            };
        }
    }
}

const encryptionManager = new EncryptionManager();
module.exports = encryptionManager;