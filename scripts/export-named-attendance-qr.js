/**
 * Find registrants by Arabic name, set their track to انتظامي
 * (onsite_exam_onsite), approve them so the gate will accept the code,
 * issue an attendance ticket without erasing existing check-ins, and
 * write one PNG per person.
 *
 *   node scripts/export-named-attendance-qr.js            # dry-run
 *   node scripts/export-named-attendance-qr.js --commit   # write
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ATTENDANCE_TRACK = 'onsite_exam_onsite';
const NAMES = [
  'مايكل رمزى عزيز تاوضروس',
  'القس يوحنا عريان عبد الملاك',
  'سوريال سامي بقطر',
  'رامز شكرى أيوب',
];
const OUT_DIR = path.join(__dirname, '..', 'attendance-qr');
const SIG_LEN = 16;

/** Same precedence as Next.js: the last line in a file wins, .env.local beats .env, and the shell beats both. */
function parseEnvFile(filePath) {
  const parsed = {};
  if (!fs.existsSync(filePath)) return parsed;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
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
if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
  privateKey = privateKey.slice(1, -1);
}
privateKey = privateKey.replace(/\\n/g, '\n');
const ticketSecret = process.env.TICKET_SECRET;

if (!projectId || !clientEmail || !privateKey || !ticketSecret) {
  console.error('Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, or TICKET_SECRET.');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const db = getFirestore();

function normalizeAr(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITLES = new Set(['القس', 'ابونا', 'ابون', 'انبا', 'الاستاذ', 'الدكتور']);

function nameTokens(value) {
  return normalizeAr(value)
    .split(' ')
    .filter((token) => token && !TITLES.has(token));
}

function matchScore(query, candidate) {
  const q = nameTokens(query);
  const c = nameTokens(candidate);
  if (q.length === 0 || c.length === 0) return 0;
  if (q.join(' ') === c.join(' ')) return 100;
  const cSet = new Set(c);
  const qSet = new Set(q);
  const shared = q.filter((token) => cSet.has(token)).length;
  if (shared === q.length && q.length === c.length) return 100;
  if (shared === q.length && q.length >= 3) return 90;
  if (shared === c.length && c.length >= 3 && [...c].every((token) => qSet.has(token))) return 85;
  return 0;
}

function signTicket(ticketId) {
  const sig = createHmac('sha256', ticketSecret).update(ticketId).digest('hex').substring(0, SIG_LEN);
  return `${ticketId}.${sig}`;
}

function safeFileName(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim();
}

function isApproved(status) {
  return status === 'approved' || status === 'auto_approved';
}

async function main() {
  const commit = process.argv.includes('--commit');
  console.log(commit ? 'COMMIT — Firestore and PNG files will be written.' : 'DRY-RUN — no writes.');

  const snapshot = await db.collection('registrants').select('fullName', 'track', 'status').get();
  const people = snapshot.docs.map((doc) => ({
    id: doc.id,
    fullName: typeof doc.data().fullName === 'string' ? doc.data().fullName : '',
    track: typeof doc.data().track === 'string' ? doc.data().track : '',
    status: typeof doc.data().status === 'string' ? doc.data().status : '',
  }));

  const sample = await db.collection('tickets').select('qrToken').limit(25).get();
  const signed = sample.docs.filter((doc) => typeof doc.data().qrToken === 'string');
  const matching = signed.filter((doc) => doc.data().qrToken === signTicket(doc.id)).length;
  console.log(`TICKET_SECRET check: ${matching}/${signed.length} existing tickets verify.`);
  if (signed.length > 0 && matching === 0) {
    console.error('TICKET_SECRET does not match the tickets the server issued. Nothing was written.');
    process.exit(1);
  }

  if (commit) fs.mkdirSync(OUT_DIR, { recursive: true });

  let failed = 0;

  for (const requestedName of NAMES) {
    const ranked = people
      .map((person) => ({ person, score: matchScore(requestedName, person.fullName) }))
      .filter((row) => row.score >= 85)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const tied = ranked.filter((row) => row.score === best?.score);

    if (!best || tied.length !== 1) {
      failed += 1;
      console.log(`\nNO UNIQUE MATCH  ${requestedName}`);
      for (const row of ranked.slice(0, 5)) {
        console.log(`  candidate ${row.score}  ${row.person.fullName}  track=${row.person.track}  status=${row.person.status}`);
      }
      continue;
    }

    const person = best.person;
    const fileName = `${safeFileName(requestedName)}.png`;
    console.log(`\nMATCH  ${requestedName}`);
    console.log(`  stored name: ${person.fullName}`);
    console.log(`  id: ${person.id}`);
    console.log(`  track: ${person.track || '(none)'} -> ${ATTENDANCE_TRACK}`);
    console.log(`  status: ${person.status || '(none)'}${isApproved(person.status) ? '' : ' -> approved'}`);
    console.log(`  file: attendance-qr/${fileName}`);

    if (!commit) continue;

    const registrantRef = db.collection('registrants').doc(person.id);
    const registrantUpdate = { track: ATTENDANCE_TRACK };
    if (!isApproved(person.status)) {
      registrantUpdate.status = 'approved';
      registrantUpdate.verifiedAt = FieldValue.serverTimestamp();
    }
    await registrantRef.update(registrantUpdate);

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

    await QRCode.toFile(path.join(OUT_DIR, fileName), qrToken, {
      width: 600,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'L',
    });
    console.log('  written');
  }

  if (!commit) {
    console.log('\nRe-run with --commit to update Firestore and write the PNG files.');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : 'unknown error');
  process.exit(1);
});
