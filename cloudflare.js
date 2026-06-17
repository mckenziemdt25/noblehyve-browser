// cloudflare.js - SECURE VERSION with no hardcoded credentials
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

class CloudflareR2 {
    constructor() {
        this.bucketName = 'noblehyve-codes';
        this.credPath = path.join(app.getPath('userData'), 'cloudflare_creds.encrypted');
        this.s3Client = null;
        this.loadCredentials();
    }
    
    /**
     * Load encrypted credentials from disk
     * Credentials are stored encrypted using Electron's safeStorage (OS-level encryption)
     */
    loadCredentials() {
        try {
            if (fs.existsSync(this.credPath)) {
                const encryptedData = fs.readFileSync(this.credPath, 'utf8');
                const data = JSON.parse(encryptedData);
                
                // Decrypt using Electron's safeStorage
                if (safeStorage.isEncryptionAvailable()) {
                    const decrypted = safeStorage.decryptString(Buffer.from(data.encrypted, 'base64'));
                    const creds = JSON.parse(decrypted);
                    
                    this.accountId = creds.accountId;
                    this.accessKeyId = creds.accessKeyId;
                    this.secretAccessKey = creds.secretAccessKey;
                    
                    // Initialize S3 client
                    this.initS3Client();
                    console.log('✅ Cloudflare credentials loaded from encrypted storage');
                    return true;
                } else {
                    console.warn('⚠️ SafeStorage not available - using fallback (not recommended)');
                    // Fallback for unsupported platforms (Linux)
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
    
    /**
     * Initialize S3 client with current credentials
     */
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
            maxAttempts: 3,  // Retry failed requests
            retryMode: 'adaptive'
        });
        
        console.log('✅ S3 Client initialized for Cloudflare R2');
    }
    
    /**
     * Save credentials with OS-level encryption
     * @param {string} accountId - Cloudflare account ID
     * @param {string} accessKeyId - R2 access key ID  
     * @param {string} secretAccessKey - R2 secret access key
     * @returns {boolean} Success status
     */
    saveCredentials(accountId, accessKeyId, secretAccessKey) {
        try {
            // Validate inputs
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
            
            // Use Electron's safeStorage for encryption (Windows/macOS)
            if (safeStorage.isEncryptionAvailable()) {
                const encrypted = safeStorage.encryptString(credsString);
                encryptedData = {
                    encrypted: encrypted.toString('base64'),
                    method: 'safeStorage',
                    version: '1.0'
                };
            } else {
                // Fallback for Linux - still store but with warning
                console.warn('⚠️ SafeStorage not available. Credentials stored with minimal protection.');
                encryptedData = {
                    legacy: credentials,
                    method: 'plaintext',
                    version: '1.0'
                };
            }
            
            // Write encrypted file with restricted permissions
            fs.writeFileSync(this.credPath, JSON.stringify(encryptedData, null, 2), {
                mode: 0o600  // Owner read/write only (Unix permissions)
            });
            
            // Update in-memory credentials
            this.accountId = credentials.accountId;
            this.accessKeyId = credentials.accessKeyId;
            this.secretAccessKey = credentials.secretAccessKey;
            
            // Reinitialize client with new credentials
            this.initS3Client();
            
            console.log('✅ Cloudflare credentials saved securely');
            return true;
            
        } catch (err) {
            console.error('Failed to save credentials:', err.message);
            return false;
        }
    }
    
    /**
     * Check if credentials are configured and valid
     * @returns {boolean}
     */
    hasCredentials() {
        return !!(this.accountId && this.accessKeyId && this.secretAccessKey && this.s3Client);
    }
    
    /**
     * Test connection to R2 bucket
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async testConnection() {
        if (!this.hasCredentials()) {
            return { success: false, message: 'No credentials configured' };
        }
        
        try {
            // Try to list files (limited to 1 to test connection)
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
    
    /**
     * Get user ID for file isolation
     * Uses Supabase user ID if available, otherwise falls back to local UUID
     * @param {string|null} [preferredId] - Supabase user ID to use (optional)
     * @returns {string}
     */
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
    
    /**
     * Upload encrypted file to R2
     * @param {string} filename - Original filename
     * @param {string|Buffer} encryptedContent - Already encrypted content
     * @param {string|null} [userId] - Optional Supabase user ID (for multi-user isolation)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async uploadFile(filename, encryptedContent, userId = null) {
        try {
            if (!this.s3Client) {
                throw new Error('Cloudflare not configured. Please add credentials in Settings → Cloud Storage.');
            }
            
            // Sanitize filename to prevent path traversal
            const safeFilename = this.sanitizeFilename(filename);
            const uid = this.getUserId(userId);
            const key = `user_${uid}/${safeFilename}.encrypted`;
            
            console.log('Uploading to R2:', key);
            
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: encryptedContent,
                ContentType: 'application/octet-stream',  // Binary encrypted data
                Metadata: {
                    uploadedAt: new Date().toISOString(),
                    originalFilename: safeFilename,
                    userId: uid.substring(0, 8)  // Partial for debugging only
                }
            });
            
            const result = await this.s3Client.send(command);
            console.log('✅ Uploaded:', safeFilename, result.$metadata.httpStatusCode);
            return { success: true };
            
        } catch (error) {
            console.error('Upload failed:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Download encrypted file from R2
     * @param {string} filename - Filename to download
     * @param {string|null} [userId] - Optional Supabase user ID (for multi-user isolation)
     * @returns {Promise<{success: boolean, content?: string, error?: string}>}
     */
    async downloadFile(filename, userId = null) {
        try {
            if (!this.s3Client) {
                throw new Error('Cloudflare not configured. Please add credentials in Settings → Cloud Storage.');
            }
            
            const safeFilename = this.sanitizeFilename(filename);
            const uid = this.getUserId(userId);
            const key = `user_${uid}/${safeFilename}.encrypted`;
            
            console.log('Downloading from R2:', key);
            
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });
            
            const response = await this.s3Client.send(command);
            
            // Handle both string and buffer responses
            let content;
            if (response.Body) {
                content = await response.Body.transformToString();
            } else {
                throw new Error('Empty response body');
            }
            
            console.log('✅ Downloaded:', safeFilename);
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
    
    /**
     * List all user files in R2 bucket
     * @param {string|null} [userId] - Optional Supabase user ID (for multi-user isolation)
     * @returns {Promise<{success: boolean, files: string[], error?: string}>}
     */
    async listFiles(userId = null) {
        try {
            if (!this.s3Client) {
                console.warn('listFiles: s3Client not initialized');
                return { success: true, files: [] };  // Not configured yet
            }
            
            const uid = this.getUserId(userId);
            const prefix = `user_${uid}/`;
            
            console.log('Listing files with prefix:', prefix);
            
            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Prefix: prefix,
                MaxKeys: 100  // Limit results
            });
            
            const response = await this.s3Client.send(command);
            
            const files = [];
            if (response.Contents) {
                for (const obj of response.Contents) {
                    const key = obj.Key;
                    const filename = key.replace(prefix, '').replace('.encrypted', '');
                    if (filename && !filename.startsWith('.')) {  // Skip hidden files
                        files.push(filename);
                    }
                }
            }
            
            console.log(`Found ${files.length} files in cloud`);
            return { success: true, files: files };
            
        } catch (error) {
            console.error('List files failed:', error.name, error.message);
            return { success: false, error: error.name + ': ' + error.message, files: [] };
        }
    }
    
    /**
     * Delete file from R2 bucket
     * @param {string} filename - Filename to delete
     * @param {string|null} [userId] - Optional Supabase user ID (for multi-user isolation)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async deleteFile(filename, userId = null) {
        try {
            if (!this.s3Client) {
                throw new Error('Cloudflare not configured');
            }
            
            const safeFilename = this.sanitizeFilename(filename);
            const uid = this.getUserId(userId);
            const key = `user_${uid}/${safeFilename}.encrypted`;
            
            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });
            
            await this.s3Client.send(command);
            console.log(`✅ Deleted from cloud: ${safeFilename}`);
            return { success: true };
            
        } catch (error) {
            console.error('Delete failed:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Sanitize filename to prevent path traversal and injection
     * @param {string} filename - Original filename
     * @returns {string} Sanitized filename
     */
    sanitizeFilename(filename) {
        if (!filename) return 'untitled';
        
        // Remove path traversal attempts
        let safe = filename
            .replace(/\.\./g, '')           // Remove ..
            .replace(/\\/g, '_')             // Backslashes to underscore
            .replace(/\//g, '_')             // Forward slashes to underscore
            .replace(/^\.+/, '')             // Remove leading dots
            .replace(/[<>:"|?*]/g, '_')      // Replace Windows reserved chars
            .replace(/[\x00-\x1f\x80-\x9f]/g, '') // Remove control chars
            .trim();
        
        // Limit length
        if (safe.length === 0) safe = 'untitled';
        if (safe.length > 100) safe = safe.substring(0, 100);
        
        return safe;
    }
    
    /**
     * Get storage usage statistics
     * @param {string|null} [userId] - Optional Supabase user ID (for multi-user isolation)
     * @returns {Promise<{success: boolean, fileCount?: number, totalSize?: number, error?: string}>}
     */
    async getStorageStats(userId = null) {
        try {
            if (!this.s3Client) {
                return { success: false, error: 'Not configured' };
            }
            
            const uid = this.getUserId(userId);
            const prefix = `user_${uid}/`;
            
            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Prefix: prefix
            });
            
            const response = await this.s3Client.send(command);
            
            let totalSize = 0;
            const files = response.Contents || [];
            
            for (const obj of files) {
                totalSize += obj.Size || 0;
            }
            
            return {
                success: true,
                fileCount: files.length,
                totalSize: totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
            };
            
        } catch (error) {
            console.error('Failed to get storage stats:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Remove all stored credentials (logout)
     */
    clearCredentials() {
        try {
            if (fs.existsSync(this.credPath)) {
                fs.unlinkSync(this.credPath);
            }
            this.accountId = null;
            this.accessKeyId = null;
            this.secretAccessKey = null;
            this.s3Client = null;
            console.log('✅ Cloudflare credentials cleared');
            return true;
        } catch (error) {
            console.error('Failed to clear credentials:', error);
            return false;
        }
    }
    
    /**
     * Check if connected and ready
     * @returns {boolean}
     */
    isConnected() {
        return !!(this.accountId && this.accessKeyId && this.secretAccessKey && this.s3Client);
    }
}

module.exports = new CloudflareR2();