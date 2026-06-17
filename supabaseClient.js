// supabaseClient.js - Using https module with timeout instead of native fetch
const fs = require('fs');
const path = require('path');
const https = require('https');

// Your Supabase credentials
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ppeevzkkovqsddqhvynw.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwZWV2emtrb3Zxc2RkcWh2eW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzU4NjQsImV4cCI6MjA5MzkxMTg2NH0.VyjKP7M8lH3cYcHyKxYzW3of90AjtO0wREWgBlhEHDA';
const FETCH_TIMEOUT = 15000;

console.log('📡 Supabase URL:', SUPABASE_URL);
console.log('🔑 Supabase Key length:', SUPABASE_ANON_KEY?.length || 0);

function httpsRequest(url, options, body) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const req = https.request({
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'POST',
            headers: options.headers || {},
            timeout: FETCH_TIMEOUT,
            rejectUnauthorized: true
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, json: () => Promise.resolve(parsed) });
                } catch {
                    resolve({ status: res.statusCode, json: () => Promise.resolve({ msg: data }) });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        if (body) req.write(body);
        req.end();
    });
}

class SupabaseManager {
    constructor() {
        this.userDataPath = this.getUserDataPath();
        this.sessionPath = path.join(this.userDataPath, 'supabase_session.json');
        this.currentUser = null;
        this.loginAttempts = new Map();
        this.maxAttempts = 5;
        this.lockoutTime = 15 * 60 * 1000;
        
        if (!fs.existsSync(this.userDataPath)) {
            fs.mkdirSync(this.userDataPath, { recursive: true });
        }
        
        this.restoreSession();
    }

    getUserDataPath() {
        try {
            const { app } = require('electron');
            return app.getPath('userData');
        } catch (error) {
            return path.join(process.cwd(), 'test_data');
        }
    }

    isRateLimited(email) {
        const attempts = this.loginAttempts.get(email);
        if (!attempts) return false;
        
        const now = Date.now();
        if (attempts.count >= this.maxAttempts) {
            if (now - attempts.lastAttempt < this.lockoutTime) {
                const remaining = Math.ceil((this.lockoutTime - (now - attempts.lastAttempt)) / 1000 / 60);
                throw new Error(`Too many attempts. Try again in ${remaining} minutes.`);
            } else {
                this.loginAttempts.delete(email);
            }
        }
        return false;
    }
    
    recordFailedAttempt(email) {
        const attempts = this.loginAttempts.get(email) || { count: 0, lastAttempt: 0 };
        attempts.count++;
        attempts.lastAttempt = Date.now();
        this.loginAttempts.set(email, attempts);
    }
    
    clearFailedAttempts(email) {
        this.loginAttempts.delete(email);
    }

    async signUp(email, password) {
        console.log('📡 Signup attempt for:', email);
        
        if (!this.validateEmail(email)) {
            return { success: false, error: 'Invalid email format' };
        }
        if (!password || password.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters' };
        }

        try {
            const body = JSON.stringify({
                email: email.trim().toLowerCase(),
                password: password,
                data: {}
            });

            const response = await httpsRequest(`${SUPABASE_URL}/auth/v1/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            }, body);

            const data = await response.json();
            console.log('Signup response status:', response.status);
            
            if (!response.ok) {
                throw new Error(data.msg || data.message || 'Signup failed');
            }

            return {
                success: true,
                requiresConfirmation: true,
                message: 'Verification email sent! Please check your inbox.'
            };
        } catch (error) {
            console.error('Signup error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async login(email, password) {
        console.log('📡 Login attempt for:', email);
        
        try {
            this.isRateLimited(email);
            
            const body = JSON.stringify({
                email: email.trim().toLowerCase(),
                password: password
            });

            const response = await httpsRequest(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY
                }
            }, body);

            const data = await response.json();
            console.log('Login response status:', response.status);
            
            if (!response.ok) {
                throw new Error(data.msg || data.message || 'Invalid credentials');
            }

            // Check if email is verified (Supabase returns user data)
            if (data.user && !data.user.email_confirmed_at) {
                this.recordFailedAttempt(email);
                return {
                    success: false,
                    error: 'Please verify your email first. Check your inbox.',
                    requiresConfirmation: true
                };
            }

            this.currentUser = {
                id: data.user.id,
                email: data.user.email,
                access_token: data.access_token,
                refresh_token: data.refresh_token
            };
            
            this.clearFailedAttempts(email);
            await this.saveSession();
            
            console.log('✅ Login successful for:', email);
            return { success: true, user: this.currentUser };
        } catch (error) {
            this.recordFailedAttempt(email);
            console.error('Login error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async logout() {
        try {
            this.currentUser = null;
            await this.clearSession();
            console.log('✅ Logout successful');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    async isEmailConfirmed() {
        if (!this.currentUser) return false;
        return this.currentUser.email_confirmed_at !== null;
    }

    async resendConfirmation(email) {
        try {
            const body = JSON.stringify({
                email: email.trim().toLowerCase(),
                type: 'signup'
            });

            const response = await httpsRequest(`${SUPABASE_URL}/auth/v1/resend`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY
                }
            }, body);

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.msg || 'Failed to resend');
            }

            return { success: true, message: 'Verification email resent!' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async restoreSession() {
        try {
            if (fs.existsSync(this.sessionPath)) {
                const session = JSON.parse(fs.readFileSync(this.sessionPath, 'utf8'));
                if (session.user && session.user.access_token) {
                    this.currentUser = session.user;
                    console.log('✅ Session restored for:', this.currentUser.email);
                    return { success: true, user: this.currentUser };
                }
            }
        } catch (error) {
            console.error('Session restore error:', error);
        }
        return { success: false };
    }

    async saveSession() {
        try {
            if (this.currentUser) {
                fs.writeFileSync(this.sessionPath, JSON.stringify({
                    user: this.currentUser,
                    savedAt: Date.now()
                }));
                console.log('✅ Session saved');
            }
        } catch (error) {
            console.error('Save session error:', error);
        }
    }

    async clearSession() {
        try {
            if (fs.existsSync(this.sessionPath)) {
                fs.unlinkSync(this.sessionPath);
                console.log('✅ Session cleared');
            }
        } catch (error) {
            console.error('Clear session error:', error);
        }
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}

module.exports = new SupabaseManager();