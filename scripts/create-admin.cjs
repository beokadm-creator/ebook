// One-time script to create admin user in Firebase Auth + Firestore
const admin = require('firebase-admin');
const { execSync } = require('child_process');

// Get access token from Firebase CLI using proper command
let accessToken;
try {
  // Use Firebase CLI to get token - it's already logged in
  const result = execSync('npx firebase auth:print-access-token 2>&1', { encoding: 'utf-8' });
  // Extract just the token (might have extra output)
  accessToken = result.split('\n').find(line => 
    line.trim() && !line.includes('Warning') && !line.includes('info') && !line.includes('Error')
  )?.trim();
  
  if (!accessToken || accessToken.length < 20) {
    throw new Error('Token too short or empty: ' + result);
  }
} catch (e) {
  console.error('Firebase CLI token failed:', e.message);
  console.error('Trying application-default credentials...');
  
  // Fallback: try to use GOOGLE_APPLICATION_CREDENTIALS or application-default
  try {
    // On Windows with Firebase CLI logged in, try the stored credentials
    const homeDir = process.env.USERPROFILE || process.env.HOME;
    const path = require('path');
    const fs = require('fs');
    
    // Try Firebase CLI stored credentials
    const credPath = path.join(homeDir, '.firebase', 'credentials.json');
    if (fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      // Use refresh token to get access token
      console.log('Found Firebase CLI credentials, using refresh token...');
      accessToken = null; // Can't easily use refresh token without HTTP call
    }
  } catch (e2) {
    // Ignore
  }
  
  if (!accessToken) {
    console.error('');
    console.error('Could not get Firebase access token automatically.');
    console.error('Please run this command first:');
    console.error('  $env:GOOGLE_APPLICATION_CREDENTIALS="<path-to-service-account-key>"');
    console.error('  OR: firebase login:ci');
    console.error('');
    console.error('Alternatively, create the user manually:');
    console.error('  1. Go to Firebase Console > Authentication > Users');
    console.error('  2. Add user with ADMIN_EMAIL / ADMIN_PASSWORD');
    console.error('  3. Go to Firestore > users collection');
    console.error('  4. Add document with UID from Auth, containing: { role: "admin", email: ADMIN_EMAIL }');
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.accessToken(accessToken),
  projectId: 'ebook-c74b2',
});

const auth = admin.auth();
const db = admin.firestore();

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME || 'Admin';

if (!email || !password) {
  console.error('Missing required environment variables: ADMIN_EMAIL, ADMIN_PASSWORD');
  process.exit(1);
}

async function createAdmin() {
  try {
    // Try to create user
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email,
        password,
        emailVerified: true,
      });
      console.log('✅ Created new user:', userRecord.uid);
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        userRecord = await auth.getUserByEmail(email);
        console.log('ℹ️  User already exists:', userRecord.uid);
      } else {
        throw err;
      }
    }

    // Create/update Firestore user document with admin role
    await db.collection('users').doc(userRecord.uid).set({
      email,
      role: 'admin',
      displayName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log('✅ Firestore user document created with role: admin');
    console.log('📧 Email:', email);
    console.log('🔑 UID:', userRecord.uid);
    console.log('');
    console.log('관리자 로그인 준비 완료!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createAdmin();
