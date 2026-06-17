const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const licenseManager = require('./license-manager');

const FREE_LIMITS = {
    cloudSaves: 5,
    localEncrypts: 5,
    cloudMaxBytes: 5 * 1024 * 1024
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
        return { cloudSaves: 0, localEncrypts: 0 };
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
            cloudSaves: { used: this.usage.cloudSaves, limit: FREE_LIMITS.cloudSaves, remaining: Math.max(0, FREE_LIMITS.cloudSaves - this.usage.cloudSaves) },
            localEncrypts: { used: this.usage.localEncrypts, limit: FREE_LIMITS.localEncrypts, remaining: Math.max(0, FREE_LIMITS.localEncrypts - this.usage.localEncrypts) },
            cloudMaxBytes: isPremium ? Infinity : FREE_LIMITS.cloudMaxBytes
        };
    }

    incrementCloudSave() {
        if (licenseManager.isPremiumUser()) return true;
        if (this.usage.cloudSaves >= FREE_LIMITS.cloudSaves) return false;
        this.usage.cloudSaves++;
        this.save();
        return true;
    }

    incrementLocalEncrypt() {
        if (licenseManager.isPremiumUser()) return true;
        if (this.usage.localEncrypts >= FREE_LIMITS.localEncrypts) return false;
        this.usage.localEncrypts++;
        this.save();
        return true;
    }

    canCloudSave() {
        if (licenseManager.isPremiumUser()) return true;
        return this.usage.cloudSaves < FREE_LIMITS.cloudSaves;
    }

    canLocalEncrypt() {
        if (licenseManager.isPremiumUser()) return true;
        return this.usage.localEncrypts < FREE_LIMITS.localEncrypts;
    }

    isOverMaxBytes(bytes) {
        if (licenseManager.isPremiumUser()) return false;
        return bytes > FREE_LIMITS.cloudMaxBytes;
    }

    resetOnPremium() {
        this.usage.cloudSaves = 0;
        this.usage.localEncrypts = 0;
        this.save();
    }
}

module.exports = new UsageManager();
