// Create admin user using Firebase Auth REST API (Identity Toolkit)
// This uses the Firebase Web API key directly - no Admin SDK needed
const https = require('https');

const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME || 'Admin';

if (!FIREBASE_API_KEY || !EMAIL || !PASSWORD) {
  console.error('Missing required environment variables: VITE_FIREBASE_API_KEY, ADMIN_EMAIL, ADMIN_PASSWORD');
  process.exit(1);
}

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(data)),
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function createAdmin() {
  try {
    // Step 1: Sign up the user using Firebase Auth REST API
    console.log('Creating user via Firebase Auth REST API...');
    const signUpResult = await httpsPost(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
      {
        email: EMAIL,
        password: PASSWORD,
        returnSecureToken: true,
      }
    );
    console.log('✅ User created in Firebase Auth!');
    console.log('📧 Email:', EMAIL);
    console.log('🔑 UID:', signUpResult.localId);
    console.log('');

    // Step 2: We need to create Firestore document too
    // But that requires Admin SDK. Let's output instructions.
    console.log('⚠️  Firestore users document needs to be created manually:');
    console.log('');
    console.log('Go to Firebase Console > Firestore Database:');
    console.log(`  Collection: users`);
    console.log(`  Document ID: ${signUpResult.localId}`);
    console.log('  Fields:');
    console.log(`    email: "${EMAIL}"`);
    console.log('    role: "admin"');
    console.log(`    displayName: "${DISPLAY_NAME}"`);
    console.log('');
    console.log('OR use this Firestore REST API call (with the ID token):');
    console.log('');
    console.log(`curl -X PATCH "https://firestore.googleapis.com/v1/projects/ebook-c74b2/databases/(default)/documents/users/${signUpResult.localId}" \\`);
    console.log('  -H "Content-Type: application/json" \\');
    console.log(`  -d '{"fields":{"email":{"stringValue":"${EMAIL}"},"role":{"stringValue":"admin"},"displayName":{"stringValue":"${DISPLAY_NAME}"}}}'`);

  } catch (err) {
    if (err.message.includes('EMAIL_EXISTS')) {
      console.log('ℹ️  User already exists in Firebase Auth');
      console.log('Trying to sign in to get UID...');
      
      try {
        const signInResult = await httpsPost(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
          {
            email: EMAIL,
            password: PASSWORD,
            returnSecureToken: true,
          }
        );
        console.log('✅ Sign-in successful!');
        console.log('🔑 UID:', signInResult.localId);
        console.log('');
        console.log('Now creating Firestore user document using ID token...');
        
        // Use Firestore REST API with the ID token
        const idToken = signInResult.idToken;
        const uid = signInResult.localId;
        
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/ebook-c74b2/databases/(default)/documents/users/${uid}`;
        
        // We need a different approach - Firestore REST requires OAuth, not ID token
        // Use the patch method with the user's ID token won't work for admin role
        // Let's just output the curl command
        console.log('');
        console.log('⚠️  Firestore document needs to be created in Firebase Console:');
        console.log(`  Collection: users`);
        console.log(`  Document ID: ${uid}`);
        console.log('  Fields:');
        console.log(`    email: "${EMAIL}"`);
        console.log('    role: "admin"');
        console.log(`    displayName: "${DISPLAY_NAME}"`);
        console.log('');
        console.log(`UID for Firestore: ${uid}`);
        
      } catch (signInErr) {
        console.error('❌ Sign-in failed:', signInErr.message);
      }
    } else {
      console.error('❌ Error:', err.message);
    }
  }
}

createAdmin();
