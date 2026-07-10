const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const GUMROAD_PRODUCT_ID = 'yozdw';
const GUMROAD_VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

class LicenseManager extends EventEmitter {
    constructor() {
        super();
        this.licensePath = path.join(app.getPath('userData'), 'license.key');
        this.dataPath = path.join(app.getPath('userData'), 'license-data.json');
        this.devFlagPath = path.join(app.getPath('userData'), '.noblehyve_dev');
        this.isPremium = false;
        this.purchaseData = null;
        this.refreshTimer = null;
        this.loadLicense();
    }

    loadLicense() {
        try {
            if (this.isDevMode()) {
                this.isPremium = true;
                console.log('Dev mode — premium features unlocked');
                return;
            }

            if (fs.existsSync(this.dataPath)) {
                const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
                this.purchaseData = data;
                if (data.premium) {
                    this.isPremium = true;
                    console.log('Cached premium license active');
                    this.scheduleRefresh();
                    this.refreshStatus();
                }
            }
        } catch (error) {
            console.error('License load error:', error.message);
            this.isPremium = false;
        }
    }

    isDevMode() {
        if (!app.isPackaged) return true;
        if (process.env.NOBLEHYVE_DEV === 'true' || process.env.NOBLEHYVE_DEV === '1') return true;
        if (fs.existsSync(this.devFlagPath)) return true;
        return false;
    }

    async verifyWithGumroad(licenseKey, incrementUses = false) {
        if (GUMROAD_PRODUCT_ID === 'YOUR_GUMROAD_PRODUCT_ID_HERE' || GUMROAD_PRODUCT_ID === 'PASTE_YOUR_PRODUCT_ID_HERE') {
            return { success: false, error: 'Gumroad product ID not configured' };
        }
        try {
            const body = new URLSearchParams();
            body.append('product_id', GUMROAD_PRODUCT_ID);
            body.append('license_key', licenseKey);
            if (incrementUses) body.append('increment_uses_count', 'true');

            const resp = await fetch(GUMROAD_VERIFY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });
            return await resp.json();
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    isSubscriptionActive(purchase) {
        if (!purchase) return false;
        if (!purchase.is_subscription) return true;
        if (purchase.subscription_ended_at) return false;
        return true;
    }

    async activateLicense(key) {
        if (!key || typeof key !== 'string') {
            return { success: false, error: 'No license key provided' };
        }

        const result = await this.verifyWithGumroad(key, true);
        if (result.success) {
            const subscriptionActive = this.isSubscriptionActive(result.purchase);
            if (!subscriptionActive) {
                return { success: false, error: 'This subscription has ended. Please renew your plan.' };
            }

            fs.writeFileSync(this.licensePath, key, 'utf8');
            this.purchaseData = {
                premium: true,
                key,
                email: result.purchase?.email || '',
                uses: result.uses || 1,
                activatedAt: new Date().toISOString(),
                purchase: result.purchase
            };
            fs.writeFileSync(this.dataPath, JSON.stringify(this.purchaseData, null, 2), 'utf8');
            this.isPremium = true;
            this.scheduleRefresh();
            this.emit('status-changed', { isPremium: true });
            return { success: true, message: 'License activated successfully!' };
        }

        const errorMsg = result.error === 'That license does not exist for the provided product.'
            ? 'Invalid license key'
            : (result.error || 'Verification failed');
        return { success: false, error: errorMsg };
    }

    deactivateLicense() {
        try {
            if (fs.existsSync(this.licensePath)) fs.unlinkSync(this.licensePath);
            if (fs.existsSync(this.dataPath)) fs.unlinkSync(this.dataPath);
            const wasPremium = this.isPremium;
            this.isPremium = false;
            this.purchaseData = null;
            this.clearRefresh();
            if (wasPremium) {
                this.emit('status-changed', { isPremium: false });
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async refreshStatus() {
        if (!this.purchaseData?.key) return;
        const result = await this.verifyWithGumroad(this.purchaseData.key, false);
        if (!result.success) {
            console.log('License re-verification failed:', result.error);
            if (result.error === 'That license does not exist for the provided product.') {
                const wasPremium = this.isPremium;
                this.isPremium = false;
                this.purchaseData.premium = false;
                this.purchaseData.subscriptionExpired = true;
                fs.writeFileSync(this.dataPath, JSON.stringify(this.purchaseData, null, 2), 'utf8');
                this.clearRefresh();
                if (wasPremium) {
                    this.emit('status-changed', { isPremium: false, reason: 'license_removed' });
                }
            }
            return;
        }

        const subscriptionActive = this.isSubscriptionActive(result.purchase);
        if (!subscriptionActive && this.isPremium) {
            console.log('Subscription has ended — downgrading to free');
            this.isPremium = false;
            this.purchaseData.premium = false;
            this.purchaseData.subscriptionExpired = true;
            this.purchaseData.purchase = result.purchase;
            fs.writeFileSync(this.dataPath, JSON.stringify(this.purchaseData, null, 2), 'utf8');
            this.clearRefresh();
            this.emit('status-changed', { isPremium: false, reason: 'subscription_ended' });
            return;
        }

        if (this.purchaseData) {
            this.purchaseData.purchase = result.purchase;
            this.purchaseData.uses = result.uses;
            fs.writeFileSync(this.dataPath, JSON.stringify(this.purchaseData, null, 2), 'utf8');
        }
    }

    scheduleRefresh() {
        this.clearRefresh();
        this.refreshTimer = setInterval(() => {
            this.refreshStatus();
        }, REFRESH_INTERVAL_MS);
    }

    clearRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    isPremiumUser() {
        return this.isPremium;
    }

    getLicenseStatus() {
        return {
            isPremium: this.isPremium,
            hasLicense: this.purchaseData?.key ? fs.existsSync(this.licensePath) : false,
            email: this.purchaseData?.email || null,
            uses: this.purchaseData?.uses || 0,
            subscriptionExpired: this.purchaseData?.subscriptionExpired || false
        };
    }
}

module.exports = new LicenseManager();
