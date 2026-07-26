/**
 * scripts/reissue-tickets.js
 *
 * Re-signs every ticket in the `tickets` Firestore collection using the CURRENT
 * TICKET_SECRET and the new 16-char HMAC signature, then regenerates the QR data
 * URL.
 *
 * ⚠️  IMPORTANT: After running with --commit, all affected QR images change.
 *    Re-deliver the updated tickets/QR codes to attendees — the old images
 *    will no longer verify.
 *
 * Usage:
 *   node --env-file=.env scripts/reissue-tickets.js            # dry-run (default)
 *   node --env-file=.env scripts/reissue-tickets.js --dry-run   # explicit dry-run
 *   node --env-file=.env scripts/reissue-tickets.js --commit    # write changes
 */

const { createHmac } = require('crypto');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const QRCode = require('qrcode');

// ---------------------------------------------------------------------------
// Firebase init (same pattern as scripts/set-admin-role.js)
// ---------------------------------------------------------------------------
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Error: Missing Firebase Admin SDK environment variables in .env file.');
  console.error('Make sure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set.');
  process.exit(1);
}

const ticketSecret = process.env.TICKET_SECRET;
if (!ticketSecret) {
  console.error('Error: TICKET_SECRET is required in .env');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const db = getFirestore();

// ---------------------------------------------------------------------------
// HMAC helpers — mirrors src/lib/qr/hmac.ts with SIG_LEN = 16
// ---------------------------------------------------------------------------
const SIG_LEN = 16;

function signTicket(ticketId) {
  const sig = createHmac('sha256', ticketSecret)
    .update(ticketId)
    .digest('hex')
    .substring(0, SIG_LEN);
  return `${ticketId}.${sig}`;
}

/**
 * Generate QR data URL — same options as src/lib/qr/generator.ts
 * (width 600, margin 1, errorCorrectionLevel 'L')
 */
async function generateQrDataUrl(token) {
  return QRCode.toDataURL(token, {
    width: 600,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'L',
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const PAGE_SIZE = 200;

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const dryRun = !commit; // default is dry-run

  if (dryRun) {
    console.log('🔍 DRY-RUN mode — no writes will be made.');
    console.log('   Pass --commit to apply changes.\n');
  } else {
    console.log('🚀 COMMIT mode — changes WILL be written to Firestore.\n');
  }

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  let lastDoc = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = db.collection('tickets').orderBy('__name__').limit(PAGE_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      scanned++;
      const data = doc.data();
      const ticketId = doc.id;

      try {
        const newToken = signTicket(ticketId);
        const oldToken = data.qrToken || '(none)';

        // Skip if already up-to-date
        if (oldToken === newToken) {
          skipped++;
          if (dryRun) {
            console.log(`  SKIP  ${ticketId} — already current`);
          }
          continue;
        }

        const newQrImageUrl = await generateQrDataUrl(newToken);

        if (dryRun) {
          console.log(`  WOULD UPDATE  ${ticketId}`);
          console.log(`    qrToken:    ${oldToken}  →  ${newToken}`);
          console.log(`    qrImageUrl: (regenerated, ${newQrImageUrl.length} chars)`);
        } else {
          await db.collection('tickets').doc(ticketId).update({
            qrToken: newToken,
            qrImageUrl: newQrImageUrl,
          });
          console.log(`  UPDATED  ${ticketId}`);
        }
        updated++;
      } catch (err) {
        failed++;
        console.error(`  FAILED  ${ticketId}: ${err.message}`);
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  console.log('\n--- Summary ---');
  console.log(`  Scanned:  ${scanned}`);
  console.log(`  Updated:  ${updated}${dryRun ? ' (would update)' : ''}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);

  if (dryRun && updated > 0) {
    console.log('\nRe-run with --commit to apply these changes.');
  }
  if (!dryRun && updated > 0) {
    console.log('\n⚠️  Re-deliver tickets to attendees — the QR images have changed.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
