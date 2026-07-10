const { app, session } = require('electron');
const crypto = require('crypto');

class MediumSecurity {
    constructor() {
        this.blockedDomains = new Set();
        this.phishingCache = new Map();
    }
    
    async init() {
        await this.loadBlocklists();
        this.setupTrackingPrevention();
        console.log('🛡️ Medium Security active');
    }
    
    // 1. Phishing/Malware Blocking
    async loadBlocklists() {
        try {
            const response = await fetch('https://phishing.army/download/phishing_army_blocklist.txt');
            const text = await response.text();
            text.split('\n').forEach(line => {
                if (line && !line.startsWith('#')) {
                    this.blockedDomains.add(line.trim());
                }
            });
            console.log(`📋 Loaded ${this.blockedDomains.size} phishing/malware domains`);
        } catch(e) {
            this.loadDefaultBlocklist();
        }
    }
    
    loadDefaultBlocklist() {
        const defaults = ['malware-test.com', 'phishing-site.net', 'fake-banking.org', 'virus-download.ru'];
        defaults.forEach(d => this.blockedDomains.add(d));
    }
    
    async checkPhishing(url) {
        try {
            const domain = new URL(url).hostname.replace('www.', '');
            if (this.phishingCache.has(domain)) return this.phishingCache.get(domain);
            
            if (this.blockedDomains.has(domain)) {
                const result = { safe: false, type: 'phishing', message: '⚠️ This website is known for phishing or malware' };
                this.phishingCache.set(domain, result);
                return result;
            }
            
            const suspiciousPatterns = [/login/i, /verify/i, /secure/i, /account/i];
            const hasSuspiciousPath = suspiciousPatterns.some(p => p.test(url));
            const isHttp = url.startsWith('http://');
            
            if (hasSuspiciousPath && isHttp) {
                return { safe: false, type: 'suspicious', message: '⚠️ Login page on insecure connection. Possible phishing attempt.' };
            }
            
            return { safe: true };
        } catch(e) { return { safe: true }; }
    }
    
    // 2. Typo Protection
    checkTypoProtection(url) {
        const commonDomains = ['google.com', 'facebook.com', 'youtube.com', 'amazon.com', 'twitter.com', 'github.com', 'paypal.com'];
        try {
            const domain = new URL(url).hostname.replace('www.', '');
            for (const legitDomain of commonDomains) {
                const legitBase = legitDomain.replace('.com', '');
                const typos = [legitBase + 's.com', legitBase + '1.com', legitBase + '-secure.com'];
                if (typos.includes(domain) && domain !== legitDomain) {
                    return { isTypo: true, suggested: legitDomain, message: `Did you mean ${legitDomain}?` };
                }
            }
        } catch(e) {}
        return { isTypo: false };
    }
    
    // 3. Scareware Detection
    detectScareware(pageContent, url) {
        const scarewareKeywords = ['your computer is infected', 'virus detected', 'malware alert', 'call microsoft support', 'windows defender'];
        const foundKeywords = scarewareKeywords.filter(kw => pageContent.toLowerCase().includes(kw.toLowerCase()));
        if (foundKeywords.length >= 2) {
            return { isScareware: true, keywords: foundKeywords, message: '🚨 This page appears to be a scareware scam!' };
        }
        return { isScareware: false };
    }
    
    // 4. Password Breach Alerts
    async checkPasswordBreach(password) {
        try {
            const hashBuffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
            const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
            const prefix = hash.slice(0, 5);
            const suffix = hash.slice(5);
            const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
            const text = await response.text();
            const breached = text.split('\n').some(line => line.startsWith(suffix));
            return { breached, message: breached ? '🔴 This password appears in data breaches! Change it.' : '✅ Password not found in breaches.' };
        } catch(e) { return { breached: false, message: 'Could not check password' }; }
    }
    
    // 5. Tracking Prevention
    setupTrackingPrevention() {
        const trackingDomains = ['google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'facebook.com/tr'];
        session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
            if (trackingDomains.some(t => details.url.toLowerCase().includes(t))) {
                callback({ cancel: true });
            } else {
                callback({ cancel: false });
            }
        });
        
        session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
            details.requestHeaders['DNT'] = '1';
            details.requestHeaders['Sec-GPC'] = '1';
            callback({ requestHeaders: details.requestHeaders });
        });
    }
    
    // 6. Cloud Reputation
    async checkCloudReputation(url) {
        try {
            const domain = new URL(url).hostname;
            if (this.blockedDomains.has(domain)) {
                return { safe: false, source: 'Community Blocklist', reputation: 'malicious' };
            }
            return { safe: true, reputation: 'clean' };
        } catch(e) { return { safe: true }; }
    }
}

module.exports = { MediumSecurity };