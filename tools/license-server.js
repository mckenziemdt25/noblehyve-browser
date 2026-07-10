// ========================================================================
// DEPRECATED — replaced by Gumroad license verification
// NobleHyve now uses Gumroad for checkout + license key distribution.
// This file is kept for reference only; do NOT deploy.
// See SETUP-GUMROAD.md for the new setup.
// ========================================================================

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const PRIVATE_KEY_PATH = path.join(__dirname, 'private.pem');
const PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');

const DODO_API_KEY = process.env.DODO_API_KEY;
const DODO_WEBHOOK_SECRET = process.env.DODO_WEBHOOK_SECRET || '';
// Dodo API uses test vs live environment
const DODO_MODE = process.env.DODO_MODE || 'test';
const DODO_API_BASE = DODO_MODE === 'test' ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com';

// Subscription plans — set these as environment variables with your Dodo product IDs
const PLANS = {
    monthly: {
        product_id: process.env.DODO_PRODUCT_MONTHLY || 'prod_monthly_5',
        amount: 500, // $5.00 in cents
        label: 'Monthly',
        price: 5.00
    },
    yearly: {
        product_id: process.env.DODO_PRODUCT_YEARLY || 'prod_yearly_50',
        amount: 5000, // $50.00 in cents
        label: 'Yearly',
        price: 50.00
    }
};

// In-memory store for subscription -> license mapping
// In production, use a database
const subscriptions = new Map();
const licenseStore = new Map();

function generateLicense(customerId) {
    const safeId = customerId.replace(/[^a-zA-Z0-9@._-]/g, '').toLowerCase() || crypto.randomUUID();
    const licenseKey = `NOBLEHYVE-${safeId}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(licenseKey);
    const signature = sign.sign(PRIVATE_KEY, 'base64url');
    return { full: `${licenseKey}.${signature}`, body: licenseKey, customerId: safeId };
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.redirect('/checkout');
});

app.get('/checkout', (req, res) => {
    const demo = req.query.demo === '1';
    res.send(`
    <!DOCTYPE html>
    <html><body style="font-family:sans-serif;max-width:600px;margin:40px auto;text-align:center">
    <h1>NobleHyve Premium</h1>
    <p style="color:#666;margin:16px 0">Choose your subscription plan<br>
    ✅ <strong>5 GB</strong> encrypted cloud storage<br>
    ✅ Unlimited local encryption<br>
    ✅ Unlimited file uploads<br>
    ✅ Encrypted cloud storage</p>
    ${demo ? '<p style="color:#ff9800;font-weight:bold">Demo Mode — no payment required</p>' : ''}
    <form action="/create-checkout" method="POST">
        <input type="email" name="email" placeholder="Your email address" required
               style="width:100%;padding:12px;margin-bottom:12px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box">
        <select name="plan" required
                style="width:100%;padding:12px;margin-bottom:12px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box;background:#fff;">
            <option value="monthly">$${PLANS.monthly.price.toFixed(2)} / month</option>
            <option value="yearly">$${PLANS.yearly.price.toFixed(2)} / year (save 17%)</option>
        </select>
        <input type="hidden" name="demo" value="${demo ? '1' : '0'}">
        <button type="submit" style="width:100%;padding:14px;background:#007acc;color:#fff;border:0;border-radius:6px;font-size:16px;cursor:pointer;font-weight:600">
            Subscribe Now
        </button>
    </form>
    <p style="margin-top:8px;font-size:12px;color:#999">Cancel anytime · Powered by Dodo Payments</p>
    </body></html>
    `);
});

app.post('/create-checkout', async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const planKey = req.body.plan || 'monthly';
    const isDemo = req.body.demo === '1';

    if (!email || !email.includes('@')) {
        return res.status(400).send('Valid email required');
    }

    const plan = PLANS[planKey];
    if (!plan) {
        return res.status(400).send('Invalid plan');
    }

    if (!DODO_API_KEY || isDemo) {
        const { full } = generateLicense(email + '-' + planKey);
        return res.send(demoResultPage(full, email, plan));
    }

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`${DODO_API_BASE}/checkouts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DODO_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_cart: [
                    { product_id: plan.product_id, quantity: 1 }
                ],
                customer: { email },
                metadata: {
                    email,
                    plan: planKey,
                    product: 'noblehyve-premium'
                },
                return_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}&plan=${planKey}`,
                cancel_url: `${req.protocol}://${req.get('host')}/`
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('Dodo API error:', err);
            return res.status(500).send('Payment provider error. Please try again later.');
        }

        const data = await response.json();
        res.redirect(303, data.checkout_url);
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).send('Error creating checkout: ' + err.message);
    }
});

app.get('/success', async (req, res) => {
    let email = req.query.email || 'customer';
    const planKey = req.query.plan || 'monthly';
    const plan = PLANS[planKey] || PLANS.monthly;
    const subscriptionId = req.query.subscription_id || req.query.session_id || '';

    // Try to fetch subscription details from Dodo API
    if (DODO_API_KEY && subscriptionId) {
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(`${DODO_API_BASE}/subscriptions/${subscriptionId}`, {
                headers: { 'Authorization': `Bearer ${DODO_API_KEY}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.customer?.email) email = data.customer.email;
                if (data.metadata?.plan) planKey = data.metadata.plan;
            }
        } catch { /* use fallback */ }
    }

    const licenseId = `${email}-${planKey}-${Date.now()}`;
    const { full } = generateLicense(licenseId);

    // Store subscription-to-license mapping
    if (subscriptionId) {
        subscriptions.set(subscriptionId, { email, plan: planKey, licenseKey: full, active: true });
    }

    res.send(successPage(full, email, plan, subscriptionId));
});

app.get('/manage', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html><body style="font-family:sans-serif;max-width:600px;margin:40px auto;text-align:center">
    <h2>Manage Subscription</h2>
    <p style="color:#666">To cancel or update your payment method, email: <strong>support@noblehyve.com</strong></p>
    <p style="margin-top:20px"><a href="/" style="color:#007acc">Back to home</a></p>
    </body></html>
    `);
});

app.post('/api/webhook', (req, res) => {
    const signature = req.headers['x-dodo-signature'];
    if (DODO_WEBHOOK_SECRET && signature) {
        const payload = JSON.stringify(req.body);
        const expected = crypto.createHmac('sha256', DODO_WEBHOOK_SECRET).update(payload).digest('hex');
        if (signature !== expected) {
            console.warn('Webhook signature mismatch');
            return res.status(401).send('Invalid signature');
        }
    }

    const event = req.body;
    console.log('Webhook received:', event.type);

    // Extract data from various Dodo webhook payload shapes
    const data = event.data || event.data?.object || {};
    const email = data.customer?.email || data.metadata?.email || 'webhook-user';
    const planKey = data.metadata?.plan || 'monthly';
    const subscriptionId = data.subscription_id || data.id || '';
    const licenseId = `${email}-${planKey}`;

    switch (event.type) {
        case 'subscription.active':
            if (!licenseStore.has(licenseId)) {
                const { full } = generateLicense(licenseId);
                licenseStore.set(licenseId, { licenseKey: full, email, plan: planKey, active: true });
                subscriptions.set(subscriptionId, { email, plan: planKey, licenseKey: full, active: true });
                console.log(`License activated for ${email} (${planKey}): ${full.substring(0, 40)}...`);
            }
            break;

        case 'subscription.renewed':
            console.log(`Subscription renewed for ${email} (${planKey})`);
            // License remains valid — no change needed
            break;

        case 'subscription.on_hold':
        case 'subscription.failed':
            console.warn(`Subscription issue for ${email}: ${event.type}`);
            // Mark as inactive — optionally notify user
            if (subscriptionId && subscriptions.has(subscriptionId)) {
                const sub = subscriptions.get(subscriptionId);
                sub.active = false;
            }
            break;

        case 'subscription.updated':
            console.log(`Subscription updated for ${email}`);
            break;

        case 'payment.succeeded':
            console.log(`Payment succeeded for ${email}`);
            break;

        case 'payment.failed':
            console.warn(`Payment failed for ${email}`);
            break;
    }

    res.status(200).send('OK');
});

app.post('/api/generate-key', (req, res) => {
    const { customer_id } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'customer_id required' });
    const { full, body, customerId } = generateLicense(customer_id);
    res.json({ license_key: full, customer_id: customerId, key_body: body });
});

app.get('/api/verify-subscription', (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });

    // Check active subscriptions for this email
    for (const [subId, sub] of subscriptions) {
        if (sub.email === email && sub.active) {
            return res.json({ active: true, licenseKey: sub.licenseKey, plan: sub.plan });
        }
    }

    // Also check license store
    for (const [lid, lic] of licenseStore) {
        if (lid.startsWith(email) && lic.active) {
            return res.json({ active: true, licenseKey: lic.licenseKey, plan: lic.plan });
        }
    }

    res.json({ active: false });
});

function demoResultPage(licenseKey, email, plan) {
    return `
    <!DOCTYPE html>
    <html><body style="font-family:sans-serif;max-width:600px;margin:40px auto">
    <h2>Demo Mode — License Key Generated</h2>
    <p style="color:#666">No DODO_API_KEY configured. Set it in environment variables to accept real payments.</p>
    <p>Plan: <strong>${plan.label} — $${plan.price.toFixed(2)}</strong></p>
    <pre style="background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px;overflow-wrap:break-word;white-space:pre-wrap;font-size:13px">${licenseKey}</pre>
    <p style="font-size:12px;color:#888">Key tied to: ${email} · Enter in NobleHyve Settings → License</p>
    <p style="margin-top:20px"><a href="/checkout" style="color:#007acc">Back to checkout</a></p>
    </body></html>`;
}

function successPage(licenseKey, email, plan, subscriptionId) {
    return `
    <!DOCTYPE html>
    <html><body style="font-family:sans-serif;max-width:600px;margin:40px auto">
    <h2>Subscription Active!</h2>
    <p style="color:#666">Your <strong>${plan.label} — $${plan.price.toFixed(2)}</strong> plan is now active.</p>
    <h3>Your Premium License Key</h3>
    <pre style="background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px;overflow-wrap:break-word;white-space:pre-wrap;font-size:13px">${licenseKey}</pre>
    <p><strong>How to activate:</strong></p>
    <ol style="line-height:1.8">
        <li>Open NobleHyve Browser</li>
        <li>Go to Settings → Premium</li>
        <li>Paste the key above and click <strong>Activate Premium</strong></li>
    </ol>
    <p style="font-size:12px;color:#888">Key tied to: ${email} · Subscription ID: ${subscriptionId || 'N/A'}</p>
    <p style="margin-top:20px;font-size:12px;color:#666">You can cancel anytime by contacting support.</p>
    </body></html>`;
}

app.listen(PORT, () => {
    console.log(`NobleHyve License Server running on http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/checkout to subscribe`);
    if (!DODO_API_KEY) console.log('WARNING: DODO_API_KEY not set — running in DEMO mode (free keys)');
    console.log(`Mode: ${DODO_MODE === 'test' ? 'TEST' : 'LIVE'}`);
    console.log(`Plans: Monthly $${PLANS.monthly.price.toFixed(2)} (${PLANS.monthly.product_id}) / Yearly $${PLANS.yearly.price.toFixed(2)} (${PLANS.yearly.product_id})`);
});
