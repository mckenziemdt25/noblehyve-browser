# Privacy Policy

**Last updated: June 28, 2026**

## 1. Introduction

NobleHyve Browser ("we", "our", "us") respects your privacy. This policy explains what data we collect, how we use it, and your rights. By using NobleHyve Browser, you agree to the practices described here.

## 2. Data We Collect

### 2.1 Data You Provide

- **Cloud storage credentials**: Cloudflare R2 account credentials you configure in Settings. These are encrypted and stored locally on your device using Electron safeStorage.
- **License key**: A license key you enter to activate Premium features.
- **User ID**: A randomly generated UUID created locally to organize your files in cloud storage.
- **Files you edit, encrypt, or upload**: Code files, encryption passwords (which never leave your device), and encrypted file content.

### 2.2 Data Collected Automatically

- **Usage analytics**: Anonymous performance metrics (page load time, feature usage, error types) collected via our local Kafka pipeline. This data may be sent to our analytics service to improve the product.
- **Crash reports**: When the app crashes, we collect crash context (window type, error message, stack trace) to diagnose and fix issues.
- **Diagnostic data**: Console errors and unhandled rejections are captured as pipeline events for debugging.

### 2.3 Data from Third-Party Services

- **Supabase**: If you sign in or manage your Premium subscription, Supabase processes your authentication data. See [Supabase Privacy Policy](https://supabase.com/privacy).
- **Google Sign-In**: If you choose to sign in with Google, Google handles your authentication. See [Google Privacy Policy](https://policies.google.com/privacy).
- **Cloudflare R2**: Your files are stored in Cloudflare R2 using your own credentials. See [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/).

## 3. How We Use Your Data

- **To provide cloud storage**: Your encrypted files are stored in Cloudflare R2 using credentials you provide. We cannot decrypt your files — encryption passwords never leave your device.
- **To manage Premium features**: Your license key and account status are validated via Supabase.
- **To improve the app**: Anonymous usage analytics help us fix bugs, optimize performance, and prioritize features.
- **To diagnose crashes**: Crash reports help us identify and resolve stability issues.

## 4. Data Storage and Security

- **Local data**: Credentials, user ID, and app settings are stored in your device's user data directory (app.getPath('userData')). Cloud credentials are encrypted using Electron safeStorage.
- **Cloud data**: Files you upload to cloud storage are encrypted with your password before transmission. Your files are stored in Cloudflare R2 under your configured account.
- **Analytics data**: Pipeline events are stored locally and may be forwarded to our analytics infrastructure. We retain this data for up to 90 days.
- **Encryption**: File encryption and decryption happen entirely on your device. We never have access to your encryption passwords.

## 5. Data Sharing

We do not sell your personal data. We may share anonymized, aggregated data with third-party services for analytics purposes. We may disclose data if required by law.

## 6. Third-Party Services

NobleHyve Browser integrates with:
- **Cloudflare R2** — for user-configured cloud file storage
- **Supabase** — for authentication and Premium license management
- **Kafka** — local analytics pipeline (may forward to remote broker if configured)
- **Google** — optional sign-in provider

Each service has its own privacy policy governing how they handle your data.

## 7. Your Rights

- **Access and deletion**: You can delete your cloud files at any time through the app. Contact us to request deletion of analytics data.
- **Opt out**: You can disable the analytics pipeline by not running the pipeline server (default behavior for most users).
- **Data portability**: Your files are stored in standard encrypted format. You can download them at any time.

## 8. Children's Privacy

NobleHyve Browser is not intended for children under 13. We do not knowingly collect data from children.

## 9. Changes to This Policy

We may update this policy. Material changes will be notified through the app or at our website.

## 10. Contact

For privacy questions or data requests: **support@noblehyve.com**
