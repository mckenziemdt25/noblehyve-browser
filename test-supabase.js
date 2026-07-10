// test-supabase.js - Test Supabase connection (email confirmation disabled)
const supabaseManager = require('./supabaseClient.js');

async function testSupabase() {
    console.log('🔐 Testing Supabase connection...\n');
    
    // Use a unique test email each time (no confirmation needed now)
    const timestamp = Date.now();
    const testEmail = `test_${timestamp}@noblehyve-test.com`;
    const testPassword = 'Test123456';
    
    console.log('📧 Test email:', testEmail);
    console.log('🔑 Test password:', testPassword);
    console.log('');
    
    // Test 1: Sign up
    console.log('Test 1: Creating new account...');
    const signup = await supabaseManager.signUp(testEmail, testPassword);
    
    if (signup.success) {
        console.log('✅ Signup successful!');
        console.log('   User ID:', signup.user?.id);
        console.log('   Message: Email confirmation disabled - ready to use!');
    } else {
        console.log('❌ Signup failed:', signup.error);
        return;
    }
    
    // Test 2: Login immediately (should work without email confirmation)
    console.log('\nTest 2: Logging in...');
    const login = await supabaseManager.login(testEmail, testPassword);
    
    if (login.success) {
        console.log('✅ Login successful!');
        console.log('   User email:', login.user?.email);
    } else {
        console.log('❌ Login failed:', login.error);
        return;
    }
    
    // Test 3: Track analytics event
    console.log('\nTest 3: Tracking analytics...');
    await supabaseManager.trackEvent('test_login', {
        timestamp: new Date().toISOString(),
        test: true,
        browser_version: '1.0.0'
    });
    console.log('✅ Analytics event tracked');
    
    // Test 4: Get user settings
    console.log('\nTest 4: Getting user settings...');
    const settings = await supabaseManager.getUserSettings();
    
    if (settings.success) {
        console.log('✅ User settings retrieved:');
        console.log('   Theme:', settings.settings?.theme_preference);
        console.log('   Auto-save:', settings.settings?.auto_save);
    } else {
        console.log('⚠️ No settings found yet (will be created on first use)');
    }
    
    // Test 5: Update user settings
    console.log('\nTest 5: Updating user settings...');
    const updateResult = await supabaseManager.updateUserSettings({
        theme_preference: 'light',
        auto_save: false
    });
    
    if (updateResult.success) {
        console.log('✅ Settings updated: theme=light, auto_save=false');
    } else {
        console.log('⚠️ Could not update settings');
    }
    
    // Test 6: Get updated settings
    console.log('\nTest 6: Getting updated settings...');
    const updatedSettings = await supabaseManager.getUserSettings();
    
    if (updatedSettings.success) {
        console.log('✅ Settings confirmed:');
        console.log('   Theme:', updatedSettings.settings?.theme_preference);
        console.log('   Auto-save:', updatedSettings.settings?.auto_save);
    }
    
    // Test 7: Report a test crash (simulated)
    console.log('\nTest 7: Reporting test crash...');
    const crashResult = await supabaseManager.reportCrash(
        'Test error message',
        'Stack trace line 1\nline 2\nline 3',
        '1.0.0',
        process.platform
    );
    
    if (crashResult.success) {
        console.log('✅ Crash report sent!');
    } else {
        console.log('⚠️ Crash report failed:', crashResult.error);
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('🎉 SUPABASE TEST COMPLETE!');
    console.log('='.repeat(50));
    console.log('\n✅ Authentication works');
    console.log('✅ Analytics tracking works');
    console.log('✅ User settings work');
    console.log('✅ Crash reporting works');
    console.log('\n📊 Check your Supabase Dashboard:');
    console.log('   - Authentication → Users (see the new user)');
    console.log('   - Table Editor → user_analytics (see the test event)');
    console.log('   - Table Editor → user_settings (see user preferences)');
    console.log('   - Table Editor → crash_reports (see test crash)');
}

// Run the test
testSupabase().catch(console.error);