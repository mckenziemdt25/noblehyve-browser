// Pure local history using IndexedDB (no cloud)
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class HistoryManager {
    constructor() {
        this.dbPath = path.join(app.getPath('userData'), 'browser-history.json');
        this.history = [];
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                this.history = JSON.parse(data);
                console.log(`Loaded ${this.history.length} history entries`);
            }
        } catch (error) {
            console.error('Failed to load history:', error);
            this.history = [];
        }
    }

    save() {
        try {
            // Keep only last 30 days of history
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            this.history = this.history.filter(entry => entry.timestamp > thirtyDaysAgo);
            // Limit to 5000 entries
            if (this.history.length > 5000) {
                this.history = this.history.slice(0, 5000);
            }
            fs.writeFileSync(this.dbPath, JSON.stringify(this.history, null, 2));
        } catch (error) {
            console.error('Failed to save history:', error);
        }
    }

    addVisit(url, title) {
        if (!url || url === 'about:blank') return;
        
        const domain = this.extractDomain(url);
        const entry = {
            url: url,
            title: title || domain || url,
            domain: domain,
            timestamp: Date.now(),
            visitCount: 1
        };
        
        // Check if same URL exists in last hour
        const existingIndex = this.history.findIndex(e => 
            e.url === url && (Date.now() - e.timestamp) < 3600000
        );
        
        if (existingIndex !== -1) {
            this.history[existingIndex].visitCount++;
            this.history[existingIndex].timestamp = Date.now();
        } else {
            this.history.unshift(entry);
        }
        
        this.save();
        return entry;
    }

    getHistory(limit = 100) {
        return this.history.slice(0, limit);
    }

    searchHistory(query) {
        const lowerQuery = query.toLowerCase();
        return this.history.filter(entry => 
            entry.title.toLowerCase().includes(lowerQuery) ||
            entry.url.toLowerCase().includes(lowerQuery)
        );
    }

    clearHistory() {
        this.history = [];
        this.save();
    }

    getMostVisited(limit = 10) {
        const domainMap = new Map();
        
        this.history.forEach(entry => {
            const domain = entry.domain;
            if (domainMap.has(domain)) {
                domainMap.set(domain, {
                    domain: domain,
                    count: domainMap.get(domain).count + entry.visitCount,
                    lastVisited: Math.max(domainMap.get(domain).lastVisited, entry.timestamp)
                });
            } else {
                domainMap.set(domain, {
                    domain: domain,
                    count: entry.visitCount,
                    lastVisited: entry.timestamp
                });
            }
        });
        
        const sorted = Array.from(domainMap.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
        
        return sorted;
    }

    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return url;
        }
    }
}

module.exports = { HistoryManager };