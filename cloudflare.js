const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

class CloudflareR2 {
    constructor() {
        this.bucketName = 'noblehyve-codes';
        this.credPath = path.join(app.getPath('userData'), 'cloudflare_creds.encrypted');
        this.s3Client = null;
        this.statsCache = { data: null, lastFetched: 0, ttl: 10000 };
        this.loadCredentials();
    }

    invalidateCache() {
        this.statsCache.lastFetched = 0;
    }

    loadCredentials() {
        try {
            if (fs.existsSync(this.credPath)) {
                const encryptedData = fs.readFileSync(this.credPath, 'utf8');
                const data = JSON.parse(encryptedData);

                if (safeStorage.isEncryptionAvailable()) {
                    const decrypted = safeStorage.decryptString(Buffer.from(data.encrypted, 'base64'));
                    const creds = JSON.parse(decrypted);

                    this.accountId = creds.accountId;
                    this.accessKeyId = creds.accessKeyId;
                    this.secretAccessKey = creds.secretAccessKey;

                    this.initS3Client();
                    console.log('Cloudflare credentials loaded from encrypted storage');
                    return true;
                } else {
                    console.warn('SafeStorage not available - using fallback');
                    if (data.legacy && data.legacy.accountId) {
                        this.accountId = data.legacy.accountId;
                        this.accessKeyId = data.legacy.accessKeyId;
                        this.secretAccessKey = data.legacy.secretAccessKey;
                        this.initS3Client();
                        return true;
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load credentials:', err.message);
        }

        console.log('No valid Cloudflare credentials found. User must configure in settings.');
        return false;
    }

    initS3Client() {
        if (!this.accountId || !this.accessKeyId || !this.secretAccessKey) {
            console.warn('Cannot initialize S3 client - missing credentials');
            return;
        }

        this.s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey
            },
            maxAttempts: 3,
            retryMode: 'adaptive'
        });

        console.log('S3 Client initialized for Cloudflare R2');
    }

    saveCredentials(accountId, accessKeyId, secretAccessKey) {
        try {
            if (!accountId || !accessKeyId || !secretAccessKey) {
                throw new Error('All credential fields are required');
            }

            const credentials = {
                accountId: accountId.trim(),
                accessKeyId: accessKeyId.trim(),
                secretAccessKey: secretAccessKey.trim(),
                createdAt: new Date().toISOString()
            };

            let encryptedData;
            const credsString = JSON.stringify(credentials);

            if (safeStorage.isEncryptionAvailable()) {
                const encrypted = safeStorage.encryptString(credsString);
                encryptedData = {
                    encrypted: encrypted.toString('base64'),
                    method: 'safeStorage',
                    version: '1.0'
                };
            } else {
                console.warn('SafeStorage not available. Credentials stored with minimal protection.');
                encryptedData = {
                    legacy: credentials,
                    method: 'plaintext',
                    version: '1.0'
                };
            }

            fs.writeFileSync(this.credPath, JSON.stringify(encryptedData, null, 2), {
                mode: 0o600
            });

            this.accountId = credentials.accountId;
            this.accessKeyId = credentials.accessKeyId;
            this.secretAccessKey = credentials.secretAccessKey;

            this.initS3Client();

            console.log('Cloudflare credentials saved securely');
            return true;

        } catch (err) {
            console.error('Failed to save credentials:', err.message);
            return false;
        }
    }

    hasCredentials() {
        return !!(this.accountId && this.accessKeyId && this.secretAccessKey && this.s3Client);
    }

    async testConnection() {
        if (!this.hasCredentials()) {
            return { success: false, message: 'No credentials configured' };
        }

        try {
            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                MaxKeys: 1
            });

            await this.s3Client.send(command);
            return { success: true, message: 'Connection successful' };
        } catch (error) {
            console.error('Connection test failed:', error.message);
            return {
                success: false,
                message: `Connection failed: ${error.message}`
            };
        }
    }

    getUserId(preferredId = null) {
        if (preferredId) {
            return preferredId;
        }
        try {
            const idPath = path.join(app.getPath('userData'), 'user_id.txt');
            if (fs.existsSync(idPath)) {
                return fs.readFileSync(idPath, 'utf8').trim();
            } else {
                const userId = randomUUID();
                fs.writeFileSync(idPath, userId, { mode: 0o600 });
                return userId;
            }
        } catch (err) {
            console.error('Failed to get user ID:', err);
            return 'anonymous_user_' + Date.now();
        }
    }

    getTierPrefix(isPremium) {
        return isPremium ? 'premium' : 'free';
    }

    buildKey(filename, userId, tier) {
        const safeFilename = this.sanitizeFilename(filename);
        const uid = this.getUserId(userId);
        const tierPrefix = this.getTierPrefix(tier);
        return `user_${uid}/${tierPrefix}/${safeFilename}.encrypted`;
    }

    async uploadFile(filename, encryptedContent, userId = null, isPremium = false) {
        try {
            if (!this.s3Client) {
                throw new Error('Cloudflare not configured. Please add credentials in Settings -> Cloud Storage.');
            }

            const safeFilename = this.sanitizeFilename(filename);
            const uid = this.getUserId(userId);
            const key = this.buildKey(filename, userId, isPremium);

            console.log('Uploading to R2:', key);

            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: encryptedContent,
                ContentType: 'application/octet-stream',
                Metadata: {
                    uploadedAt: new Date().toISOString(),
                    originalFilename: safeFilename,
                    userId: uid.substring(0, 8),
                    tier: isPremium ? 'premium' : 'free'
                }
            });

            await this.s3Client.send(command);
            console.log('Uploaded:', safeFilename);
            this.invalidateCache();
            return { success: true };

        } catch (error) {
            console.error('Upload failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    async downloadFile(filename, userId = null, isPremium = false) {
        try {
            if (!this.s3Client) {
                throw new Error('Cloudflare not configured. Please add credentials in Settings -> Cloud Storage.');
            }

            const key = this.buildKey(filename, userId, isPremium);

            console.log('Downloading from R2:', key);

            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });

            const response = await this.s3Client.send(command);

            let content;
            if (response.Body) {
                content = await response.Body.transformToString();
            } else {
                throw new Error('Empty response body');
            }

            console.log('Downloaded:', key);
            return { success: true, content: content };

        } catch (error) {
            console.error('Download failed:', error.message);
            if (error.name === 'NoSuchKey') {
                return { success: false, error: 'File not found in cloud storage' };
            }
            if (error.message.includes('Access Denied')) {
                return { success: false, error: 'Access denied. Please check your Cloudflare credentials.' };
            }
            return { success: false, error: error.message };
        }
    }

    async listFiles(userId = null, isPremium = false) {
        try {
            if (!this.s3Client) {
                console.warn('listFiles: s3Client not initialized');
                return { success: true, files: [] };
            }

            const uid = this.getUserId(userId);
            const tierPrefix = this.getTierPrefix(isPremium);
            const prefix = `user_${uid}/${tierPrefix}/`;

            console.log('Listing files with prefix:', prefix);

            const files = [];
            let continuationToken = null;

            do {
                const command = new ListObjectsV2Command({
                    Bucket: this.bucketName,
                    Prefix: prefix,
                    MaxKeys: 1000,
                    ContinuationToken: continuationToken
                });

                const response = await this.s3Client.send(command);
                const objects = response.Contents || [];

                for (const obj of objects) {
                    const key = obj.Key;
                    const filename = key.replace(prefix, '').replace('.encrypted', '');
                    if (filename && !filename.startsWith('.')) {
                        files.push(filename);
                    }
                }

                continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
            } while (continuationToken);

            console.log(`Found ${files.length} files in cloud`);
            return { success: true, files: files };

        } catch (error) {
            console.error('List files failed:', error.name, error.message);
            return { success: false, error: error.name + ': ' + error.message, files: [] };
        }
    }

    async deleteFile(filename, userId = null, isPremium = false) {
        try {
            if (!this.s3Client) {
                throw new Error('Cloudflare not configured');
            }

            const key = this.buildKey(filename, userId, isPremium);

            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });

            await this.s3Client.send(command);
            console.log('Deleted from cloud:', key);
            this.invalidateCache();
            return { success: true };

        } catch (error) {
            console.error('Delete failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    sanitizeFilename(filename) {
        if (!filename) return 'untitled';

        let safe = filename
            .replace(/\.\./g, '')
            .replace(/\\/g, '_')
            .replace(/\//g, '_')
            .replace(/^\.+/, '')
            .replace(/[<>:"|?*]/g, '_')
            .replace(/[\x00-\x1f\x80-\x9f]/g, '')
            .trim();

        if (safe.length === 0) safe = 'untitled';
        if (safe.length > 100) safe = safe.substring(0, 100);

        return safe;
    }

    async getStorageStats(userId = null, isPremium = false, forceRefresh = false) {
        try {
            if (!this.s3Client) {
                return { success: false, error: 'Not configured' };
            }

            const now = Date.now();
            if (!forceRefresh && this.statsCache.data && (now - this.statsCache.lastFetched) < this.statsCache.ttl) {
                return this.statsCache.data;
            }

            const uid = this.getUserId(userId);
            const tierPrefix = this.getTierPrefix(isPremium);
            const prefix = `user_${uid}/${tierPrefix}/`;

            let totalSize = 0;
            let fileCount = 0;
            let continuationToken = null;

            do {
                const command = new ListObjectsV2Command({
                    Bucket: this.bucketName,
                    Prefix: prefix,
                    ContinuationToken: continuationToken
                });

                const response = await this.s3Client.send(command);
                const objects = response.Contents || [];

                for (const obj of objects) {
                    totalSize += obj.Size || 0;
                    fileCount++;
                }

                continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
            } while (continuationToken);

            const result = {
                success: true,
                fileCount: fileCount,
                totalSize: totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
            };

            this.statsCache.data = result;
            this.statsCache.lastFetched = now;

            return result;

        } catch (error) {
            console.error('Failed to get storage stats:', error.message);
            return { success: false, error: error.message };
        }
    }

    async migrateToPremium(userId = null) {
        try {
            if (!this.s3Client) {
                return { success: false, error: 'Not configured' };
            }

            const uid = this.getUserId(userId);
            const freePrefix = `user_${uid}/free/`;
            const premiumPrefix = `user_${uid}/premium/`;

            console.log('Migrating files from', freePrefix, 'to', premiumPrefix);

            const listCommand = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Prefix: freePrefix
            });

            const response = await this.s3Client.send(listCommand);
            const objects = response.Contents || [];

            if (objects.length === 0) {
                return { success: true, migratedCount: 0 };
            }

            let migrated = 0;
            for (const obj of objects) {
                const sourceKey = obj.Key;
                const destKey = sourceKey.replace(freePrefix, premiumPrefix);

                await this.s3Client.send(new CopyObjectCommand({
                    Bucket: this.bucketName,
                    CopySource: `${this.bucketName}/${sourceKey}`,
                    Key: destKey,
                    MetadataDirective: 'REPLACE',
                    Metadata: {
                        uploadedAt: new Date().toISOString(),
                        migratedAt: new Date().toISOString(),
                        tier: 'premium'
                    }
                }));

                await this.s3Client.send(new DeleteObjectCommand({
                    Bucket: this.bucketName,
                    Key: sourceKey
                }));

                migrated++;
            }

            console.log(`Migrated ${migrated} files to premium`);
            this.invalidateCache();
            return { success: true, migratedCount: migrated };

        } catch (error) {
            console.error('Migration to premium failed:', error.message);
            return { success: false, error: error.message, migratedCount: 0 };
        }
    }

    async downgradeToFree(userId = null) {
        try {
            if (!this.s3Client) {
                return { success: false, error: 'Not configured' };
            }

            const uid = this.getUserId(userId);
            const premiumPrefix = `user_${uid}/premium/`;
            const freePrefix = `user_${uid}/free/`;

            console.log('Downgrading files from', premiumPrefix, 'to', freePrefix);

            const listCommand = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Prefix: premiumPrefix
            });

            const response = await this.s3Client.send(listCommand);
            const objects = response.Contents || [];

            if (objects.length === 0) {
                return { success: true, migratedCount: 0 };
            }

            let migrated = 0;
            for (const obj of objects) {
                const sourceKey = obj.Key;
                const destKey = sourceKey.replace(premiumPrefix, freePrefix);

                await this.s3Client.send(new CopyObjectCommand({
                    Bucket: this.bucketName,
                    CopySource: `${this.bucketName}/${sourceKey}`,
                    Key: destKey,
                    MetadataDirective: 'REPLACE',
                    Metadata: {
                        uploadedAt: new Date().toISOString(),
                        downgradedAt: new Date().toISOString(),
                        tier: 'free'
                    }
                }));

                await this.s3Client.send(new DeleteObjectCommand({
                    Bucket: this.bucketName,
                    Key: sourceKey
                }));

                migrated++;
            }

            console.log(`Downgraded ${migrated} files to free`);
            this.invalidateCache();
            return { success: true, migratedCount: migrated };

        } catch (error) {
            console.error('Downgrade to free failed:', error.message);
            return { success: false, error: error.message, migratedCount: 0 };
        }
    }

    clearCredentials() {
        try {
            if (fs.existsSync(this.credPath)) {
                fs.unlinkSync(this.credPath);
            }
            this.accountId = null;
            this.accessKeyId = null;
            this.secretAccessKey = null;
            this.s3Client = null;
            console.log('Cloudflare credentials cleared');
            return true;
        } catch (error) {
            console.error('Failed to clear credentials:', error);
            return false;
        }
    }

    isConnected() {
        return !!(this.accountId && this.accessKeyId && this.secretAccessKey && this.s3Client);
    }
}

module.exports = new CloudflareR2();
