// test-encryption.js - Test your encryption system with detailed logging
const encryption = require('./encryption.js');

async function testEncryption() {
    console.log('🔐 Testing encryption system...\n');
    
    // Get storage info first
    console.log('Environment:', encryption.dataPath);
    console.log('');
    
    // Test 1: Save encrypted file with detailed logging
    console.log('Test 1: Saving encrypted file...');
    try {
        const result = encryption.saveEncryptedFile(
            'secret_document', 
            'This is my secret code. Password: mySecret123',
            'myStrongPassword123'
        );
        
        console.log('Save result:', JSON.stringify(result, null, 2));
        
        if (result && result.success) {
            console.log('✅ Saved successfully');
        } else {
            console.log('❌ Failed:', result?.error || 'Unknown error');
        }
    } catch (err) {
        console.log('❌ Exception:', err.message);
    }
    
    console.log('\n--- Waiting 1 second for file system... ---\n');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 2: List encrypted files
    console.log('Test 2: Listing encrypted files...');
    const files = encryption.listEncryptedFiles();
    if (files.success) {
        console.log('Files found:', files.files.map(f => f.name));
        if (files.files.length === 0) {
            console.log('⚠️ No files found - check data path:', encryption.dataPath);
            
            // List directory contents for debugging
            const fs = require('fs');
            if (fs.existsSync(encryption.dataPath)) {
                const dirContents = fs.readdirSync(encryption.dataPath);
                console.log('Directory contents:', dirContents);
            } else {
                console.log('Directory does not exist!');
            }
        }
    } else {
        console.log('Failed to list files:', files.error);
    }
    
    // Test 3: Load and decrypt (only if file exists)
    console.log('\nTest 3: Loading encrypted file...');
    const loaded = encryption.loadEncryptedFile('secret_document', 'myStrongPassword123');
    if (loaded.success) {
        console.log('✅ Decrypted content:', loaded.content.substring(0, 50) + '...');
    } else {
        console.log('❌ Failed:', loaded.error);
    }
    
    // Test 4: Wrong password
    console.log('\nTest 4: Wrong password attempt...');
    const wrongPassword = encryption.loadEncryptedFile('secret_document', 'wrongPassword');
    if (!wrongPassword.success) {
        console.log('✅ Correctly blocked:', wrongPassword.error);
    } else {
        console.log('❌ Should not have succeeded!');
    }
    
    // Test 5: Storage info
    console.log('\nTest 5: Storage information...');
    const info = encryption.getStorageInfo();
    console.log('Total files:', info.totalFiles);
    console.log('Storage used:', info.totalSizeKB, 'KB');
    console.log('Data path:', info.dataPath);
    
    console.log('\n✅ Encryption tests complete!');
}

// Run the test
testEncryption().catch(console.error);