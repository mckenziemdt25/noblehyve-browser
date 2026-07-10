const crypto = require('crypto');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class PasswordManager {
    constructor(masterPassword) {
        this.dbPath = path.join(app.getPath('userData'), 'passwords.enc');
        this.masterPassword = masterPassword;
        this.passwords = new Map(); // domain -> array of {username, password, notes}
        this.load();
    }

    deriveKey(password, salt) {
        return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    }

    encrypt(data) {
        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(16);
        const key = this.deriveKey(this.masterPassword, salt);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        const encrypted = Buffer.concat([
            cipher.update(JSON.stringify(data), 'utf8'),
            cipher.final()
        ]);
        
        const authTag = cipher.getAuthTag();
        
        return {
            salt: salt.toString('hex'),
            iv: iv.toString('hex'),
            data: encrypted.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    decrypt(encryptedData) {
        try {
            const salt = Buffer.from(encryptedData.salt, 'hex');
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const key = this.deriveKey(this.masterPassword, salt);
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            const decrypted = Buffer.concat([
                decipher.update(Buffer.from(encryptedData.data, 'hex')),
                decipher.final()
            ]);
            
            return JSON.parse(decrypted.toString('utf8'));
        } catch (error) {
            console.error('Decryption failed - wrong password?', error);
            return null;
        }
    }

    load() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const rawData = fs.readFileSync(this.dbPath, 'utf8');
                const encrypted = JSON.parse(rawData);
                const decrypted = this.decrypt(encrypted);
                if (decrypted) {
                    this.passwords = new Map(Object.entries(decrypted));
                    console.log(`Loaded passwords for ${this.passwords.size} domains`);
                }
            }
        } catch (error) {
            console.error('Failed to load passwords:', error);
        }
    }

    save() {
        try {
            const toSave = Object.fromEntries(this.passwords);
            const encrypted = this.encrypt(toSave);
            fs.writeFileSync(this.dbPath, JSON.stringify(encrypted, null, 2));
        } catch (error) {
            console.error('Failed to save passwords:', error);
        }
    }

    savePassword(domain, username, password, notes = '') {
        if (!this.passwords.has(domain)) {
            this.passwords.set(domain, []);
        }
        
        const domainPasswords = this.passwords.get(domain);
        const existing = domainPasswords.find(p => p.username === username);
        
        if (existing) {
            existing.password = password;
            existing.notes = notes;
            existing.updatedAt = Date.now();
        } else {
            domainPasswords.push({
                username: username,
                password: password,
                notes: notes,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }
        
        this.save();
        return true;
    }

    getPasswords(domain) {
        return this.passwords.get(domain) || [];
    }

    getAllPasswords() {
        return Object.fromEntries(this.passwords);
    }

    deletePassword(domain, username) {
        if (this.passwords.has(domain)) {
            const domainPasswords = this.passwords.get(domain);
            const filtered = domainPasswords.filter(p => p.username !== username);
            if (filtered.length === 0) {
                this.passwords.delete(domain);
            } else {
                this.passwords.set(domain, filtered);
            }
            this.save();
            return true;
        }
        return false;
    }

    changeMasterPassword(oldPassword, newPassword) {
        // Decrypt with old, re-encrypt with new
        if (this.masterPassword !== oldPassword) {
            return false;
        }
        this.masterPassword = newPassword;
        this.save(); // Re-encrypts with new password
        return true;
    }
}

module.exports = { PasswordManager };