import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

// Check if Firebase Client keys are fully configured
export const isFirebaseConfigured = !!apiKey && apiKey !== 'placeholder-api-key';

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  const firebaseConfig = {
    apiKey: apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  // Singleton pattern — avoid re-initializing on hot reload
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  dbInstance = getFirestore(app);
  authInstance = getAuth(app);
  storageInstance = getStorage(app);
}

export const db = dbInstance as Firestore;
export const auth = authInstance as Auth;
export const storage = storageInstance as FirebaseStorage;
