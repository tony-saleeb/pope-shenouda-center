import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { genericApiError } from '@/lib/http/apiError';
import { REVIEW_QUEUE_COLLECTION, REVIEW_QUEUE_DOC, syncReviewQueueCount } from '@/lib/reviewQueue';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const correlationId = randomUUID();

  try {
    const db = getAdminDb();
    const snap = await db.collection(REVIEW_QUEUE_COLLECTION).doc(REVIEW_QUEUE_DOC).get();
    const stored = snap.data()?.count;
    if (typeof stored === 'number' && Number.isFinite(stored)) {
      return NextResponse.json({ count: Math.max(0, Math.floor(stored)) });
    }

    const count = await syncReviewQueueCount(db);
    return NextResponse.json({ count });
  } catch (error) {
    console.error(`[Admin review count] ${correlationId} failed:`, error);
    return genericApiError(correlationId);
  }
}
