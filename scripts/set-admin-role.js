const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Ensure env variables are loaded
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Error: Missing Firebase Admin SDK environment variables in .env file.');
  console.error('Make sure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set.');
  process.exit(1);
}

// Initialize Admin App safely
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const auth = getAuth();
const email = process.argv[2];
const role = process.argv[3] || 'admin'; // defaults to admin

if (!email) {
  console.log('Usage: node --env-file=.env scripts/set-admin-role.js <email> [role]');
  console.log('Example: node --env-file=.env scripts/set-admin-role.js admin@church.org admin');
  process.exit(1);
}

if (!['admin', 'usher'].includes(role)) {
  console.error('Error: Role must be "admin" or "usher"');
  process.exit(1);
}

async function setStaffRole() {
  try {
    const user = await auth.getUserByEmail(email);
    await auth.setCustomUserClaims(user.uid, { role });

    console.log(`✅ Successfully set role "${role}" for user ${email} (UID: ${user.uid})`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting custom claims:', error.message);
    process.exit(1);
  }
}

setStaffRole();
