import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const normalizeStorageBucket = (value?: string) => {
  if (!value) {
    return '';
  }

  return value.replace(/^gs:\/\//, '').trim();
};

const requiredFirebaseEnvKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

const missingFirebaseEnvKeys = requiredFirebaseEnvKeys.filter((key) => !import.meta.env[key]);

if (missingFirebaseEnvKeys.length > 0) {
  console.warn(`[firebase] missing env: ${missingFirebaseEnvKeys.join(', ')}`);
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: normalizeStorageBucket(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Firebase 초기화 (중복 방지)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Firebase 서비스 초기화
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// 개발 환경에서 Emulator 연결
if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_USE_EMULATOR === 'true') {
  // Firestore Emulator
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.log('🔥 Firestore Emulator에 연결되었습니다 (localhost:8080)');
  } catch {
    console.log('Firestore Emulator 이미 연결됨');
  }

  // Auth Emulator
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    console.log('🔥 Auth Emulator에 연결되었습니다 (localhost:9099)');
  } catch {
    console.log('Auth Emulator 이미 연결됨');
  }

  // Storage Emulator
  try {
    connectStorageEmulator(storage, 'localhost', 9199);
    console.log('🔥 Storage Emulator에 연결되었습니다 (localhost:9199)');
  } catch {
    console.log('Storage Emulator 이미 연결됨');
  }

  // Functions Emulator
  try {
    connectFunctionsEmulator(functions, 'localhost', 5001);
    console.log('🔥 Functions Emulator에 연결되었습니다 (localhost:5001)');
  } catch {
    console.log('Functions Emulator 이미 연결됨');
  }
}

export default app;
