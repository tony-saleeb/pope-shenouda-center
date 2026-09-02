/**
 * Deletes previous-event attendee data so the project can serve a new event.
 * Keeps admin/staff accounts. Does not change security rules.
 *
 * Run: node --env-file=.env scripts/wipe-attendee-data.js --commit
 * Dry run (default): node --env-file=.env scripts/wipe-attendee-data.js
 */
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const COMMIT = process.argv.includes('--commit');

const COLLECTIONS = ['registrants', 'phoneIndex', 'tickets', 'bankTransactions'];
const STORAGE_PREFIXES = ['screenshots/', 'tickets/'];

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
if (rawKey.startsWith('"') && rawKey.endsWith('"')) rawKey = rawKey.slice(1, -1);
const privateKey = rawKey.replace(/\\n/g, '\n');
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase Admin credentials in .env');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket,
  });
}

const db = getFirestore();

async function countAndDeleteCollection(name) {
  const snapshot = await db.collection(name).get();
  console.log(`${name}: ${snapshot.size} documents`);
  if (!COMMIT || snapshot.size === 0) return snapshot.size;

  let deleted = 0;
  let batch = db.batch();
  let inBatch = 0;
  for (const docSnap of snapshot.docs) {
    batch.delete(docSnap.ref);
    inBatch += 1;
    deleted += 1;
    if (inBatch === 400) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();
  console.log(`  deleted ${deleted}`);
  return deleted;
}

async function wipeStorage() {
  if (!storageBucket) {
    console.log('storage: skipped (no bucket configured)');
    return;
  }
  try {
    const bucket = getStorage().bucket();
    for (const prefix of STORAGE_PREFIXES) {
      const [files] = await bucket.getFiles({ prefix });
      console.log(`storage ${prefix}: ${files.length} objects`);
      if (!COMMIT || files.length === 0) continue;
      await bucket.deleteFiles({ prefix });
      console.log(`  deleted prefix ${prefix}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log('storage: skipped —', message);
  }
}

(async () => {
  console.log('project:', projectId);
  console.log(COMMIT ? 'MODE: COMMIT — documents will be deleted' : 'MODE: dry-run (pass --commit to delete)');

  for (const name of COLLECTIONS) {
    await countAndDeleteCollection(name);
  }
  await wipeStorage();

  console.log('admins/staff: left untouched');
  process.exit(0);
})().catch((error) => {
  console.error('FATAL:', error.message);
  process.exit(1);
});
