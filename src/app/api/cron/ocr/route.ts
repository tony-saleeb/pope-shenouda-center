import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { processRegistrantOcr } from '@/lib/ocr/processor';
import { getCronSecret } from '@/lib/env';

/** Extend max execution duration for Vercel functions (12s throttles + downloads + vision API). */
export const maxDuration = 60;

// Limit the batch size to respect free-tier rate limits
const BATCH_SIZE = 5;

// Throttle delay between model calls (in milliseconds)
const THROTTLE_DELAY = 3000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      .orderBy('createdAt', 'asc')
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({
        message: 'No queued registrants found.',
        processedCount: 0,
      });
    }

    const results: Array<{ id: string; success: boolean; status: string; error?: string }> = [];

    for (const doc of snapshot.docs) {
      const registrantId = doc.id;
      console.log(`[Cron OCR] Processing registrant: ${registrantId}`);

      const result = await processRegistrantOcr(registrantId);
      results.push({
        id: registrantId,
        success: result.success,
        status: result.status,
        error: result.error,
      });

      // Throttle to stay within Gemini free tier per-minute limits
      await sleep(THROTTLE_DELAY);
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
