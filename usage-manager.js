const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const licenseManager = require('./license-manager');

const FREE_LIMITS = {
    cloudMaxBytes: 100 * 1024 * 1024
};

const PREMIUM_LIMITS = {
    cloudMaxBytes: 5 * 1024 * 1024 * 1024
};

class UsageManager {
    constructor() {
        this.usagePath = path.join(app.getPath('userData'), 'usage.json');
        this.usage = this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.usagePath)) {
                return JSON.parse(fs.readFileSync(this.usagePath, 'utf8'));
            }
        } catch (err) {
            console.error('Failed to load usage:', err.message);
        }
        return {};
    }

    save() {
        try {
            fs.writeFileSync(this.usagePath, JSON.stringify(this.usage, null, 2));
        } catch (err) {
            console.error('Failed to save usage:', err.message);
        }
    }

    getStatus() {
        const isPremium = licenseManager.isPremiumUser();
        return {
            isPremium,
            cloudMaxBytes: isPremium ? PREMIUM_LIMITS.cloudMaxBytes : FREE_LIMITS.cloudMaxBytes
        };
    }

    getCloudMaxBytes() {
        return licenseManager.isPremiumUser() ? PREMIUM_LIMITS.cloudMaxBytes : FREE_LIMITS.cloudMaxBytes;
    }

    resetOnPremium() {
        this.usage = {};
        this.save();
    }
}

module.exports = new UsageManager();
