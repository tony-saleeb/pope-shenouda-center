/**
 * Issue attendance QR codes for approved انتسابي and سماعي registrants.
 * Their track is left unchanged. Existing check-ins are kept.
 *
 *   node scripts/export-track-attendance-qr.js            # dry-run
 *   node scripts/export-track-attendance-qr.js --commit   # write
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIG_LEN = 16;
const TRACKS = {
  online_exam_onsite: 'انتسابي',
  online_no_exam: 'سماعي',
};
const OUT_DIR = path.join(__dirname, '..', 'attendance-qr');

function parseEnvFile(filePath) {
  const parsed = {};
  if (!fs.existsSync(filePath)) return parsed;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

const fileEnv = {
  ...parseEnvFile(path.join(__dirname, '..', '.env')),
  ...parseEnvFile(path.join(__dirname, '..', '.env.local')),
};
for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);
privateKey = privateKey.replace(/\\n/g, '\n');
const ticketSecret = process.env.TICKET_SECRET;

if (!projectId || !clientEmail || !privateKey || !ticketSecret) {
  console.error('Missing Firebase admin credentials or TICKET_SECRET.');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db = getFirestore();

function signTicket(ticketId) {
  const sig = createHmac('sha256', ticketSecret).update(ticketId).digest('hex').substring(0, SIG_LEN);
  return `${ticketId}.${sig}`;
}

function safeFileName(name) {
  return String(name || '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim();
}

function isApproved(status) {
  return status === 'approved' || status === 'auto_approved';
}

async function main() {
  const commit = process.argv.includes('--commit');
  console.log(commit ? 'COMMIT — tickets and PNG files will be written.' : 'DRY-RUN — no writes.');

  const sample = await db.collection('tickets').select('qrToken').limit(25).get();
  const signed = sample.docs.filter((doc) => typeof doc.data().qrToken === 'string');
  const matching = signed.filter((doc) => doc.data().qrToken === signTicket(doc.id)).length;
  console.log(`TICKET_SECRET check: ${matching}/${signed.length} existing tickets verify.`);
  if (signed.length > 0 && matching === 0) {
    console.error('TICKET_SECRET does not match tickets the server issued. Nothing was written.');
    process.exit(1);
  }

  const snapshot = await db
    .collection('registrants')
    .where('track', 'in', Object.keys(TRACKS))
    .select('fullName', 'track', 'status')
    .get();

  const people = snapshot.docs.map((doc) => ({
    id: doc.id,
    fullName: typeof doc.data().fullName === 'string' ? doc.data().fullName : '',
    track: doc.data().track,
    status: typeof doc.data().status === 'string' ? doc.data().status : '',
  }));

  const skipped = people.filter((person) => !isApproved(person.status));
  const ready = people
    .filter((person) => isApproved(person.status))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'));

  for (const [track, label] of Object.entries(TRACKS)) {
    const group = people.filter((person) => person.track === track);
    const approved = group.filter((person) => isApproved(person.status)).length;
    console.log(`${label}: ${approved} approved, ${group.length - approved} not approved`);
  }
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} because they are not approved, so the gate would refuse the code.`);
  }

  const usedNames = new Map();
  let written = 0;

  for (const person of ready) {
    const folder = TRACKS[person.track];
    const base = safeFileName(person.fullName) || person.id;
    const seen = (usedNames.get(`${folder}/${base}`) ?? 0) + 1;
    usedNames.set(`${folder}/${base}`, seen);
    const fileName = seen === 1 ? `${base}.png` : `${base}-${person.id.slice(0, 8)}.png`;
    console.log(`${folder}/${fileName}  ${person.status}`);

    if (!commit) continue;

    const dir = path.join(OUT_DIR, folder);
    fs.mkdirSync(dir, { recursive: true });

    const ticketRef = db.collection('tickets').doc(person.id);
    const existing = await ticketRef.get();
    const qrToken = signTicket(person.id);
    const qrImageUrl = await QRCode.toDataURL(qrToken, {
      width: 600,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'L',
    });
    if (existing.exists) {
      await ticketRef.set({ qrToken, qrImageUrl, registrantId: person.id }, { merge: true });
    } else {
      await ticketRef.set({
        qrToken,
        qrImageUrl,
        registrantId: person.id,
        used: false,
        usedAt: null,
        usedByUsherId: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await QRCode.toFile(path.join(dir, fileName), qrToken, {
      width: 600,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'L',
    });
    written += 1;
  }

  console.log(commit ? `Wrote ${written} QR images.` : `Would write ${ready.length} QR images.`);
  if (!commit) console.log('Re-run with --commit to update Firestore and write the PNG files.');
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : 'unknown error');
  process.exit(1);
});
