// Create Firestore user document using Firebase Admin SDK
// Uses application-default credentials from Firebase CLI login
const admin = require('firebase-admin');

async function main() {
  // Try to initialize with application default credentials
  // Firebase CLI stores credentials that gcloud ADC can use
  try {
    const { execSync } = require('child_process');
    
    // Get access token using Firebase CLI's internal mechanism
    // firebase-tools exposes a way to get tokens
    console.log('Getting Firebase CLI credentials...');
    
    // Use firebase-tools directly
    const firebaseTools = require('firebase-tools');
    const token = await firebaseTools.login.scopes.token([
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/datastore'
    ]);
    
    console.log('Got token, initializing Admin SDK...');
    admin.initializeApp({
      credential: admin.credential.accessToken(token),
      projectId: 'ebook-c74b2',
    });
    
  } catch (e) {
    console.log('Firebase-tools token failed:', e.message?.substring(0, 200));
    console.log('Trying direct initialization...');
    admin.initializeApp({ projectId: 'ebook-c74b2' });
  }

  const db = admin.firestore();
  const uid = process.env.ADMIN_UID;
  const email = process.env.ADMIN_EMAIL;
  const displayName = process.env.ADMIN_DISPLAY_NAME || 'Admin';

  if (!uid || !email) {
    console.error('Missing required environment variables: ADMIN_UID, ADMIN_EMAIL');
    process.exit(1);
  }
  
  try {
    await db.collection('users').doc(uid).set({
      email,
      role: 'admin',
      displayName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    
    console.log('SUCCESS: Firestore user document created!');
    console.log('UID:', uid);
    console.log('Role: admin');
    process.exit(0);
  } catch (error) {
    console.error('Firestore write failed:', error.message);
    console.error('');
    console.error('MANUAL STEP: Create this document in Firebase Console:');
    console.error('  Firestore > users collection > document:', uid);
    console.error(`  { email: "${email}", role: "admin", displayName: "${displayName}" }`);
    process.exit(1);
  }
}

main();
