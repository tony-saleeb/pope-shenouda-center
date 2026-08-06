const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const CRON_SECRET = process.env.CRON_SECRET;

if (!projectId || !clientEmail || !privateKey || !CRON_SECRET) {
  console.error('Error: Missing required environment variables in .env file.');
  console.error('Make sure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and CRON_SECRET are set.');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const db = getFirestore();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('🔍 Starting Batch OCR scan for all registrants missing a reference ID...\n');
  
  const snapshot = await db.collection('registrants').get();
  
  const toProcess = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.paymentScreenshotUrl && !data.ocrExtractedReference && data.ocrStatus !== 'done') {
      toProcess.push({ id: doc.id, url: data.paymentScreenshotUrl });
    }
  });

  console.log(`Found ${toProcess.length} registrants that need OCR processing.\n`);

  if (toProcess.length === 0) {
    console.log('Nothing to do!');
    process.exit(0);
  }

  // Group into batches of 1 to prevent local server memory crashes
  const BATCH_SIZE = 1;
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Triggering Cron OCR Route for batch ${i/BATCH_SIZE + 1}...`);
    
    try {
      const response = await fetch('http://localhost:3000/api/cron/ocr', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CRON_SECRET}` 
        }
      });

      if (!response.ok) {
        throw new Error(`Cron API returned HTTP ${response.status}: ${await response.text()}`);
      }

      const { results } = await response.json();

      for (const res of results) {
        // results from processor.ts contain { id, success, status, error }
        if (res.success) {
          console.log(`  ✅ ${res.id} Done. Status: ${res.status}`);
          successCount++;
        } else {
          console.log(`  ❌ ${res.id} Failed: ${res.error || 'Unknown error'}`);
          failedCount++;
        }
      }
    } catch (err) {
      console.error(`  🚨 Batch processing failed: ${err.message}`);
      failedCount += batch.length;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Successfully processed images: ${successCount}`);
  console.log(`Failed images: ${failedCount}`);
  process.exit(0);
}

main().catch(console.error);
