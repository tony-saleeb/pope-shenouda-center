import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

/**
 * Lazily initialize Firebase Admin SDK.
 * Avoids crashes at build time when env vars aren't available.
 */
function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
  if (rawKey.startsWith('"') && rawKey.endsWith('"')) {
    rawKey = rawKey.slice(1, -1);
  }
  const privateKey = rawKey.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('Firebase Admin SDK: Missing credentials, initializing with project ID only');
    return initializeApp({
      projectId: projectId || 'placeholder-project',
    });
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

// Lazy singleton — only initialize on first use
let _app: App | null = null;

function ensureApp(): App {
  if (!_app) _app = getAdminApp();
  return _app;
}

/** Get Firestore instance (lazy initialized) */
export function getAdminDb() {
  return getFirestore(ensureApp());
}

/** Get Auth instance (lazy initialized) */
export function getAdminAuth() {
  return getAuth(ensureApp());
}

/** Get Storage instance (lazy initialized) */
export function getAdminStorage() {
  return getStorage(ensureApp());
}
