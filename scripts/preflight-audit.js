const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

function getApp() {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
  if (rawKey.startsWith('"') && rawKey.endsWith('"')) {
    rawKey = rawKey.slice(1, -1);
  }
  const privateKey = rawKey.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Missing Firebase credentials in .env file');
    process.exit(1);
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const app = getApp();
const db = getFirestore(app);
const auth = getAuth(app);

async function runAudit() {
  console.log('\n======================================================');
  console.log('🔍 RUNNING PREFLIGHT AUDIT');
  console.log('======================================================\n');

  // 1. Connection Check
  console.log('--- Section 1: Connection & Credentials ---');
  console.log(`✓ Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(`✓ Client Email: ${process.env.FIREBASE_CLIENT_EMAIL}`);

  // 2. Tickets Check
  console.log('\n--- Section 2: Tickets in Circulation ---');
  try {
    const ticketsSnap = await db.collection('tickets').get();
    if (ticketsSnap.empty) {
      console.log('✓ No tickets exist in Firestore.');
    } else {
      console.log(`✗ ${ticketsSnap.size} ticket(s) exist in Firestore.`);
      ticketsSnap.docs.slice(0, 5).forEach((doc) => {
        const data = doc.data();
        console.log(`  - Ticket ID: ${doc.id}, Used: ${data.used}`);
      });
    }
  } catch (err) {
    console.error('✗ Error checking tickets:', err.message);
  }

  // 3. Admin Custom Claims Check
  console.log('\n--- Section 3: Custom Claims & Admin Accounts ---');
  const primaryAdminEmail = process.env.PRIMARY_ADMIN_EMAIL || 'tonysaleeb23@gmail.com';

  try {
    const user = await auth.getUserByEmail(primaryAdminEmail);
    const claims = user.customClaims || {};
    if (claims.role === 'admin') {
      console.log(`✓ PRIMARY ADMIN (${primaryAdminEmail}) has role=admin custom claim.`);
    } else {
      console.log(`✗ PRIMARY ADMIN (${primaryAdminEmail}) has NO role claim (claims: ${JSON.stringify(claims)}).`);
    }
  } catch (err) {
    console.log(`✗ PRIMARY ADMIN (${primaryAdminEmail}): ${err.message}`);
  }

  try {
    const adminsSnap = await db.collection('admins').get();
    console.log(`\nChecking ${adminsSnap.size} registered admin document(s)...`);
    for (const doc of adminsSnap.docs) {
      const email = doc.data().email || doc.id;
      try {
        const u = await auth.getUserByEmail(email);
        const role = u.customClaims?.role;
        if (role) {
          console.log(`  ✓ ${email}: claim role=${role}`);
        } else {
          console.log(`  ✗ ${email}: NO ROLE CLAIM SET`);
        }
      } catch {
        console.log(`  ✗ ${email}: Firebase Auth account not found`);
      }
    }
  } catch (err) {
    console.error('✗ Error checking admins collection:', err.message);
  }

  console.log('\n======================================================');
  console.log('✅ PREFLIGHT AUDIT COMPLETE');
  console.log('======================================================\n');
  process.exit(0);
}

runAudit();
