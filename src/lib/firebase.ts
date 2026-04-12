import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { logger } from './logger';

const env = ((import.meta as ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
}).env ?? {}) as Record<string, string | boolean | undefined>;

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

const missingFirebaseEnvKeys = requiredFirebaseEnvKeys.filter((key) => !env[key]);

if (missingFirebaseEnvKeys.length > 0) {
  logger.warn(`[firebase] missing env: ${missingFirebaseEnvKeys.join(', ')}`);
}

const firebaseConfig = {
  apiKey: typeof env.VITE_FIREBASE_API_KEY === 'string' ? env.VITE_FIREBASE_API_KEY : '',
  authDomain: typeof env.VITE_FIREBASE_AUTH_DOMAIN === 'string' ? env.VITE_FIREBASE_AUTH_DOMAIN : '',
  projectId: typeof env.VITE_FIREBASE_PROJECT_ID === 'string' ? env.VITE_FIREBASE_PROJECT_ID : '',
  storageBucket: normalizeStorageBucket(typeof env.VITE_FIREBASE_STORAGE_BUCKET === 'string' ? env.VITE_FIREBASE_STORAGE_BUCKET : ''),
  messagingSenderId: typeof env.VITE_FIREBASE_MESSAGING_SENDER_ID === 'string' ? env.VITE_FIREBASE_MESSAGING_SENDER_ID : '',
  appId: typeof env.VITE_FIREBASE_APP_ID === 'string' ? env.VITE_FIREBASE_APP_ID : ''
};

// Firebase 초기화 (중복 방지)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Firebase 서비스 초기화
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// 개발 환경에서 Emulator 연결
if (env.DEV && env.VITE_FIREBASE_USE_EMULATOR === 'true') {
  // Firestore Emulator
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
    logger.info('🔥 Firestore Emulator에 연결되었습니다 (localhost:8080)', { context: 'Firebase' });
  } catch {
    logger.info('Firestore Emulator 이미 연결됨', { context: 'Firebase' });
  }

  // Auth Emulator
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    logger.info('🔥 Auth Emulator에 연결되었습니다 (localhost:9099)', { context: 'Firebase' });
  } catch {
    logger.info('Auth Emulator 이미 연결됨', { context: 'Firebase' });
  }

  // Storage Emulator
  try {
    connectStorageEmulator(storage, 'localhost', 9199);
    logger.info('🔥 Storage Emulator에 연결되었습니다 (localhost:9199)', { context: 'Firebase' });
  } catch {
    logger.info('Storage Emulator 이미 연결됨', { context: 'Firebase' });
  }

  // Functions Emulator
  try {
    connectFunctionsEmulator(functions, 'localhost', 5001);
    logger.info('🔥 Functions Emulator에 연결되었습니다 (localhost:5001)', { context: 'Firebase' });
  } catch {
    logger.info('Functions Emulator 이미 연결됨', { context: 'Firebase' });
  }
}

export default app;
