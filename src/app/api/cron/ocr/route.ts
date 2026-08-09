import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { isAdminDecided, processRegistrantOcrBatch } from '@/lib/ocr/processor';
import { getCronSecret } from '@/lib/env';

/** Extend max execution duration for Vercel functions (12s throttles + downloads + vision API). */
export const maxDuration = 60;

// Limit the batch size for the external API
const BATCH_SIZE = 10;

/**
 * Constant-time bearer token authorization.
 * Note: Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on scheduled
 * cron jobs when CRON_SECRET is set as an environment variable in project settings.
 */
function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = getCronSecret();
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const providedToken = authHeader.substring(7).trim();
  const a = Buffer.from(providedToken, 'utf8');
  const b = Buffer.from(cronSecret, 'utf8');

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminDb();

    // Query oldest queued registrants
    const snapshot = await db
      .collection('registrants')
      .where('ocrStatus', '==', 'queued')
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({
        message: 'No queued registrants found.',
        processedCount: 0,
      });
    }

    const registrantsBatch: Array<{ id: string; url: string }> = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (isAdminDecided(data.status)) {
        // Already ruled on — drop it from the queue without touching the decision.
        await db.collection('registrants').doc(doc.id).update({ ocrStatus: 'skipped' });
      } else if (data.paymentScreenshotUrl) {
        registrantsBatch.push({ id: doc.id, url: data.paymentScreenshotUrl });
      } else {
        // Mark as failed immediately if no URL
        await db.collection('registrants').doc(doc.id).update({
          ocrStatus: 'failed',
          ocrConfidence: 'failed',
          status: 'manual_review',
          adminNotes: 'لم يتم العثور على صورة إيصال الدفع',
        });
      }
    }

    let results: Array<{ id: string; success: boolean; status: string; error?: string }> = [];
    if (registrantsBatch.length > 0) {
      console.log(`[Cron OCR] Processing batch of ${registrantsBatch.length} registrants...`);
      results = await processRegistrantOcrBatch(registrantsBatch);
    }

    return NextResponse.json({
      message: `Completed processing ${results.length} registrants.`,
      processedCount: results.length,
      results,
    });
  } catch (error) {
    console.error('[Cron OCR] Error in execution:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// Support POST just in case
export async function POST(request: NextRequest) {
  return GET(request);
}
