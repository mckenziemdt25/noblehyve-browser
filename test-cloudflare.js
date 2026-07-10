// test-cloudflare.js - Test your Cloudflare R2 connection
const { AwsClient } = require('aws4fetch');

// REPLACE THESE WITH YOUR ACTUAL CREDENTIALS
const accountId = '98911ab4cd455808ca6e648a02cf764a';  // From Cloudflare dashboard
const accessKeyId = 'b766d471e9b3d78802bb163fa43ee05b';  // From API token
const secretAccessKey = 'ded0632d706b16e1e9ec17552b067043a4cad1e6a5f7a05af251a2aac4146355';  // From API token
const bucketName = 'noblehyve-codes';

async function testCloudflareR2() {
    console.log('☁️ Testing Cloudflare R2 connection...\n');
    
    // Create S3 client for R2
    const client = new AwsClient({
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        service: 's3',
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`
    });
    
    // Test 1: Upload a test file
    console.log('Test 1: Uploading test file...');
    const testContent = JSON.stringify({
        message: 'Hello from NobleHyve!',
        timestamp: new Date().toISOString(),
        testData: 'This is encrypted test content'
    });
    
    const uploadUrl = `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/test-file.json`;
    
    try {
        const uploadResponse = await client.fetch(uploadUrl, {
            method: 'PUT',
            body: testContent,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (uploadResponse.status === 200) {
            console.log('✅ Upload successful!');
        } else {
            console.log('❌ Upload failed:', uploadResponse.status);
            console.log(await uploadResponse.text());
        }
    } catch (err) {
        console.error('Upload error:', err.message);
    }
    
    // Test 2: List files in bucket
    console.log('\nTest 2: Listing files...');
    const listUrl = `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/?prefix=`;
    
    try {
        const listResponse = await client.fetch(listUrl, { method: 'GET' });
        if (listResponse.status === 200) {
            const text = await listResponse.text();
            console.log('✅ List successful!');
            // Look for test-file.json in response
            if (text.includes('test-file.json')) {
                console.log('✅ Test file found in bucket!');
            }
        } else {
            console.log('❌ List failed:', listResponse.status);
        }
    } catch (err) {
        console.error('List error:', err.message);
    }
    
    // Test 3: Download the test file
    console.log('\nTest 3: Downloading test file...');
    
    try {
        const downloadResponse = await client.fetch(uploadUrl, { method: 'GET' });
        if (downloadResponse.status === 200) {
            const content = await downloadResponse.text();
            console.log('✅ Download successful!');
            console.log('Content:', content.substring(0, 100) + '...');
        } else {
            console.log('❌ Download failed:', downloadResponse.status);
        }
    } catch (err) {
        console.error('Download error:', err.message);
    }
    
    // Test 4: Delete test file
    console.log('\nTest 4: Cleaning up...');
    
    try {
        const deleteResponse = await client.fetch(uploadUrl, { method: 'DELETE' });
        if (deleteResponse.status === 204) {
            console.log('✅ Test file deleted successfully!');
        } else {
            console.log('⚠️ Could not delete test file');
        }
    } catch (err) {
        console.error('Delete error:', err.message);
    }
    
    console.log('\n🎉 Cloudflare R2 test complete!');
}

// Install aws4fetch if not already installed
// Run: npm install aws4fetch

testCloudflareR2().catch(console.error);