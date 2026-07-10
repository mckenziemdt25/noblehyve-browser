const { Kafka, Partitioners } = require('kafkajs');
const store = require('./pipeline-store.js');

class Pipeline {
    constructor() {
        this.kafka = new Kafka({
            clientId: 'noblehyve-browser',
            brokers: ['localhost:29092']
        });
        this.producer = this.kafka.producer({ allowAutoTopicCreation: true, createPartitioner: Partitioners.LegacyPartitioner });
        this.connected = false;
        this.sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        this.storeReady = false;
        this.cleanupInterval = null;
    }

    initStore() {
        try {
            store.init();
            this.storeReady = true;
            this.cleanupInterval = setInterval(() => store.cleanup(), 3600000);
            console.log('PipelineStore: initialized');
        } catch (err) {
            console.error('PipelineStore init failed:', err.message);
        }
    }

    async connect() {
        this.initStore();
        try {
            await this.producer.connect();
            this.connected = true;
            console.log('Data pipeline connected to Kafka');
        } catch (err) {
            console.error('Pipeline: Kafka not available. Start with: docker compose up -d');
            this.connected = false;
        }
    }

    async send(topic, event) {
        const payload = {
            ...event,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId
        };

        if (this.storeReady) {
            try {
                store.insert(topic, payload);
            } catch (err) {
                console.error('PipelineStore write failed:', err.message);
            }
        }

        if (!this.connected) return;
        try {
            await this.producer.send({
                topic: `noblehyve.${topic}`,
                messages: [{ value: JSON.stringify(payload, null, 0) }]
            });
        } catch (err) {
            console.error('Pipeline send failed:', err.message);
        }
    }

    async crash(event) {
        return this.send('crashes', { type: 'crash', ...event });
    }

    async editor(event) {
        return this.send('editor', { type: 'editor', ...event });
    }

    async terminal(event) {
        return this.send('terminal', { type: 'terminal', ...event });
    }

    async raw(topic, event) {
        return this.send(topic, event);
    }

    getRecent(limit = 200, severityFilter) {
        if (!this.storeReady) return [];
        return store.getRecent(limit, severityFilter);
    }

    getCounts() {
        if (!this.storeReady) return [];
        return store.getCounts();
    }

    exportJson(severityFilter) {
        if (!this.storeReady) return [];
        return store.exportJson(severityFilter);
    }

    closeStore() {
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        store.close();
        this.storeReady = false;
    }

    async disconnect() {
        if (this.connected) {
            await this.producer.disconnect();
            this.connected = false;
        }
        this.closeStore();
    }
}

module.exports = new Pipeline();
