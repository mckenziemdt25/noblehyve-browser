# Gumroad License Setup

## 1. Create your product on Gumroad

1. Go to [gumroad.com](https://gumroad.com) → Products → New Product
2. Name it **"NobleHyve Premium"**
3. Set pricing:
   - **Monthly:** $10/month (set as a subscription/recurring)
   - **Yearly:** $100/year (set as a subscription/recurring)
4. In the product content editor, click **Insert** → **License key**
5. Configure the checkout form:
   - **Call to action:** "Get Premium Now" (or whatever you prefer)
6. **Publish** the product

## 2. Get your Product ID

1. Go to the product's **Settings** / **Edit** page
2. Copy the **Product ID** from the top (looks like a hex string)
3. Open `license-manager.js` and set `GUMROAD_PRODUCT_ID` to that value

## 3. Update the Gumroad URL (if needed)

In `main.js`, the URL `https://noblehyve.gumroad.com/l/noblehyve` is used.
Replace `noblehyve` with your Gumroad username if different.

## 4. Configure Gumroad Webhooks (optional)

For real-time subscription cancellation detection, set up a webhook
in your Gumroad settings → Developer → Webhooks:

- **Webhook URL:** `https://your-server.com/gumroad-webhook`
- **Events:** `sale`, `subscription_cancelled`, `subscription_ended`, `subscription_restarted`

## How it works

### Purchase flow:
- Customer buys on Gumroad → gets a license key in email & receipt
- Customer copies key → pastes in NobleHyve Settings → Premium
- App calls `POST https://api.gumroad.com/v2/licenses/verify` to validate
- Premium unlocks instantly → Cloudflare storage upgraded to 5 GB

### Subscription management (automatic):
- The app re-checks license validity every 6 hours
- If Gumroad reports `subscription_ended_at` is set → auto-downgrades to free
- Cloudflare storage is automatically migrated back to the free tier
- Manual deactivation also triggers the downgrade

### Pricing:
- **Monthly:** $10/month
- **Yearly:** $100/year (save 17%)

No server to deploy. No database to manage.
