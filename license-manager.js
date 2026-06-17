// license-manager.js
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// EMBEDDED_PUBLIC_KEY gets injected here by: node tools/generate-keypair.js
const EMBEDDED_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxlRO8dPDIkvYXVMb+NME
wlAAOU2tfriq+JvoJRknOkeM2T8uzhLSOhMWprkXda1pQY0Pw9mjizT1dD3TMqNn
I+uqB5Gpt8YloBPv0Z021jPHcFfKM7D4zixLLweMZl9YAWt4iromDLUvJpBsx+iY
7IM5cX79+r9rQXqfhdJbd1vZB7plz26Z6IJVunc/ytK0uyuou/s2FvlKWxuiSyi6
hMcIVttIZcOQ53Pyx9+LqO1lPlWwvqgyWxvuF9FEdB/es0EVYJZERgP1uFiC+rC7
YmfCq6iF2LKZsiDOOih1c6tFCuPWv9f06LxSD72G3QWSSoKiQDWvBX915iQkgr4L
RQIDAQAB
-----END PUBLIC KEY-----`;

class LicenseManager {
    constructor() {
        this.licensePath = path.join(app.getPath('userData'), 'license.key');
        this.devFlagPath = path.join(app.getPath('userData'), '.noblehyve_dev');
        this.isPremium = false;
        this.loadLicense();
    }

    loadLicense() {
        try {
            // Developer mode — auto-enable premium for testing
            if (this.isDevMode()) {
                this.isPremium = true;
                console.log('🔧 Developer mode — premium features unlocked for testing');
                return;
            }

            if (fs.existsSync(this.licensePath)) {
                const licenseKey = fs.readFileSync(this.licensePath, 'utf8').trim();
                this.isPremium = this.validateLicense(licenseKey);
                if (this.isPremium) {
                    console.log('✅ Premium license active');
                } else {
                    console.log('⚠️ Invalid license key');
                }
            } else {
                console.log('📋 Free version - cloud features locked');
            }
        } catch (error) {
            console.error('License load error:', error);
            this.isPremium = false;
        }
    }

    isDevMode() {
        // 1. Running via npm start / electron . (not packaged)
        if (!app.isPackaged) return true;
        // 2. NOBLEHYVE_DEV environment variable set
        if (process.env.NOBLEHYVE_DEV === 'true' || process.env.NOBLEHYVE_DEV === '1') return true;
        // 3. Dev flag file exists in userData
        if (fs.existsSync(this.devFlagPath)) return true;
        return false;
    }

    validateLicense(key) {
        if (!key || typeof key !== 'string') return false;

        // Format: NOBLEHYVE-<customer-id>.<base64url-signature>
        const pattern = /^NOBLEHYVE-.+\.([A-Za-z0-9_-]+)$/;
        const match = key.match(pattern);
        if (!match) return false;

        const dotIdx = key.lastIndexOf('.');
        const licenseBody = key.substring(0, dotIdx);
        const signature = match[1];

        // If developer hasn't generated keys yet, use fallback
        if (!EMBEDDED_PUBLIC_KEY) {
            return this.fallbackValidate(key);
        }

        try {
            const verify = crypto.createVerify('RSA-SHA256');
            verify.update(licenseBody);
            return verify.verify(EMBEDDED_PUBLIC_KEY, signature, 'base64url');
        } catch (err) {
            console.error('RSA verify error:', err.message);
            return this.fallbackValidate(key);
        }
    }

    // Temporary fallback so the app still works until generate-keypair.js is run
    fallbackValidate(key) {
        const demo = [
            'NOBLEHYVE-DEMO-0000-0001',
            'NOBLEHYVE-TEST-1234-5678'
        ];
        return demo.includes(key);
    }

    activateLicense(key) {
        if (this.validateLicense(key)) {
            fs.writeFileSync(this.licensePath, key, 'utf8');
            this.isPremium = true;
            return { success: true, message: 'License activated successfully!' };
        }
        return { success: false, error: 'Invalid license key' };
    }

    deactivateLicense() {
        try {
            if (fs.existsSync(this.licensePath)) {
                fs.unlinkSync(this.licensePath);
            }
            this.isPremium = false;
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    isPremiumUser() {
        return this.isPremium;
    }

    getLicenseStatus() {
        return {
            isPremium: this.isPremium,
            hasLicense: fs.existsSync(this.licensePath)
        };
    }
}

module.exports = new LicenseManager();
