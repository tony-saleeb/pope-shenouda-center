const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const https = require('https');

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!projectId || !clientEmail || !privateKey || !GEMINI_API_KEY) {
  console.error('Error: Missing required environment variables in .env file.');
  console.error('Make sure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and GEMINI_API_KEY are set.');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const db = getFirestore();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => resolve({
        buffer: Buffer.concat(data),
        mimeType: res.headers['content-type'] || 'image/jpeg'
      }));
    }).on('error', reject);
  });
}

async function extractReceiptData(imageBuffer, mimeType) {
  const base64Data = imageBuffer.toString('base64');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = `You are analyzing an InstaPay (Egyptian peer-to-peer bank transfer) payment confirmation screenshot. The image may be a direct app screenshot or a photo taken of a phone's screen (which might have glare, moire patterns, skew, or blur).

Please extract the following information and return a JSON object matching this schema:
{
  "reference_number": "the InstaPay reference/transaction number (usually a long number, e.g., 10-12 digits) as a string, or null if unreadable",
  "amount": the numeric amount in EGP (just the number, e.g. 150, no currency symbols), or null if unreadable,
  "sender_name": "the sender's name as shown on the receipt, or null if unreadable",
  "transaction_date": "the date of transaction, or null if unreadable",
  "confidence": "high" if you can clearly read BOTH the reference number and the amount, "low" if they are blurry/partially unreadable, "failed" if this is not a payment confirmation screenshot at all,
  "notes": "any brief observations about the screenshot quality"
}

Ensure the output is valid JSON. Return ONLY the JSON object.`;

  const payload = JSON.stringify({
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json' },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Gemini API HTTP ${res.statusCode}: ${body}`));
        }
        try {
          const resData = JSON.parse(body);
          const textResponse = resData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!textResponse) throw new Error('Empty response from Gemini');
          
          let cleaned = textResponse.trim();
          if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json/i, '').replace(/```$/, '').trim();
          } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
          }
          
          resolve(JSON.parse(cleaned));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('🔍 Starting OCR scan for all registrants missing a reference ID...\n');
  
  const snapshot = await db.collection('registrants').get();
  
  const toProcess = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.paymentScreenshotUrl && !data.ocrExtractedReference && data.ocrStatus !== 'done') {
      toProcess.push({ id: doc.id, ...data });
    }
  });

  console.log(`Found ${toProcess.length} registrants that need OCR processing.\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const reg = toProcess[i];
    console.log(`[${i + 1}/${toProcess.length}] Processing ${reg.id} (${reg.fullName})...`);
    
    try {
      let buffer, mimeType;
      if (reg.paymentScreenshotUrl.startsWith('data:')) {
        const matches = reg.paymentScreenshotUrl.match(/^data:(.+);base64,(.+)$/);
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        const res = await fetchImageBuffer(reg.paymentScreenshotUrl);
        buffer = res.buffer;
        mimeType = res.mimeType;
      }

      const ocrResult = await extractReceiptData(buffer, mimeType);
      
      const updateData = {
        ocrStatus: 'done',
        ocrExtractedReference: ocrResult.reference_number || null,
        ocrExtractedAmount: ocrResult.amount != null ? Number(ocrResult.amount) : null,
        ocrExtractedSenderName: ocrResult.sender_name || null,
        ocrConfidence: ocrResult.confidence || 'failed',
      };

      await db.collection('registrants').doc(reg.id).update(updateData);
      
      console.log(`  ✅ Done. Ref: ${updateData.ocrExtractedReference || 'N/A'}, Amount: ${updateData.ocrExtractedAmount || 'N/A'}`);
      success++;
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
      failed++;
    }
    
    // ALWAYS sleep for 15 seconds to avoid Gemini rate limits (4 RPM max)
    await sleep(15000);
  }

  console.log('\n--- Summary ---');
  console.log(`Successfully processed: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log('You can now export your CSV from the admin panel!');
  process.exit(0);
}

main().catch(console.error);
