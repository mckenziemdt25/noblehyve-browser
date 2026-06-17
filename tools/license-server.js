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
const DODO_API_BASE = 'https://api.dodopayments.com';
const PRICE_AMOUNT_CENTS = process.env.PRICE_CENTS ? parseInt(process.env.PRICE_CENTS) : 999;

function generateLicense(email) {
    const customerId = email.replace(/[^a-zA-Z0-9@._-]/g, '').toLowerCase() || crypto.randomUUID();
    const licenseKey = `NOBLEHYVE-${customerId}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(licenseKey);
    const signature = sign.sign(PRIVATE_KEY, 'base64url');
    return { full: `${licenseKey}.${signature}`, body: licenseKey, customerId };
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.redirect('/checkout');
});

app.get('/checkout', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;text-align:center">
    <h1>NobleHyve Premium</h1>
    <p style="color:#666;margin:16px 0">One-time payment — lifetime license<br>
    ✅ Unlimited cloud saves<br>
    ✅ Unlimited local encryption<br>
    ✅ Files up to 50MB<br>
    ✅ Encrypted cloud storage</p>
    <p style="font-size:24px;font-weight:bold;margin:20px 0">$${(PRICE_AMOUNT_CENTS / 100).toFixed(2)}</p>
    <form action="/create-checkout" method="POST">
        <input type="email" name="email" placeholder="Your email address" required
               style="width:100%;padding:12px;margin-bottom:12px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box">
        <button type="submit" style="width:100%;padding:14px;background:#007acc;color:#fff;border:0;border-radius:6px;font-size:16px;cursor:pointer;font-weight:600">
            Buy Now — $${(PRICE_AMOUNT_CENTS / 100).toFixed(2)}
        </button>
    </form>
    <p style="margin-top:20px;font-size:12px;color:#999">Powered by Dodo Payments</p>
    </body></html>
    `);
});

app.post('/create-checkout', async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
        return res.status(400).send('Valid email required');
    }

    if (!DODO_API_KEY) {
        const { full } = generateLicense(email);
        return res.send(`
        <!DOCTYPE html>
        <html><body style="font-family:sans-serif;max-width:600px;margin:40px auto">
        <h2>Demo Mode — License Key Generated</h2>
        <p style="color:#666">No DODO_API_KEY configured. Set it in environment variables to accept real payments.</p>
        <pre style="background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px;overflow-wrap:break-word;white-space:pre-wrap;font-size:13px">${full}</pre>
        <p style="font-size:12px;color:#888">Enter this in NobleHyve Settings → License</p>
        </body></html>
        `);
    }

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`${DODO_API_BASE}/v1/payment-links`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DODO_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: PRICE_AMOUNT_CENTS,
                currency: 'USD',
                customer_email: email,
                description: 'NobleHyve Premium License',
                metadata: { email, product: 'noblehyve-premium' },
                success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`,
                cancel_url: `${req.protocol}://${req.get('host')}/cancel`
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('Dodo API error:', err);
            return res.status(500).send('Payment provider error. Please try again later.');
        }

        const data = await response.json();
        res.redirect(303, data.payment_link_url || data.url);
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).send('Error creating checkout: ' + err.message);
    }
});

app.get('/success', async (req, res) => {
    let email = req.query.email || 'customer';

    if (DODO_API_KEY && req.query.session_id) {
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(`${DODO_API_BASE}/v1/payment-links/${req.query.session_id}`, {
                headers: { 'Authorization': `Bearer ${DODO_API_KEY}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.metadata?.email) email = data.metadata.email;
            }
        } catch { /* use fallback */ }
    }

    const { full } = generateLicense(email);
    res.send(`
    <!DOCTYPE html>
    <html><body style="font-family:sans-serif;max-width:600px;margin:40px auto">
    <h2>Payment Successful!</h2>
    <h3>Your Premium License Key</h3>
    <pre style="background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px;overflow-wrap:break-word;white-space:pre-wrap;font-size:13px">${full}</pre>
    <p><strong>How to activate:</strong></p>
    <ol style="line-height:1.8">
        <li>Open NobleHyve Browser</li>
        <li>Go to Settings → Premium</li>
        <li>Paste the key above and click <strong>Activate Premium</strong></li>
    </ol>
    <p style="font-size:12px;color:#888">Key tied to: ${email}</p>
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
    if (req.body.event === 'payment.completed' || req.body.event === 'checkout.completed') {
        const email = req.body.data?.customer?.email || req.body.data?.metadata?.email || 'webhook-user';
        const { full } = generateLicense(email);
        console.log(`License generated via webhook for ${email}: ${full.substring(0, 40)}...`);
    }
    res.status(200).send('OK');
});

app.post('/api/generate-key', (req, res) => {
    const { customer_id } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'customer_id required' });
    const { full, body, customerId } = generateLicense(customer_id);
    res.json({ license_key: full, customer_id: customerId, key_body: body });
});

app.listen(PORT, () => {
    console.log(`NobleHyve License Server running on http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/checkout to buy a license`);
    if (!DODO_API_KEY) console.log('WARNING: DODO_API_KEY not set — running in DEMO mode (free keys)');
    console.log(`Price: $${(PRICE_AMOUNT_CENTS / 100).toFixed(2)}`);
});
