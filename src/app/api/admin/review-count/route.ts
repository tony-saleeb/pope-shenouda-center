import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { genericApiError } from '@/lib/http/apiError';
import { syncReviewQueueCount } from '@/lib/reviewQueue';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const correlationId = randomUUID();

  try {
    const count = await syncReviewQueueCount(getAdminDb());
    return NextResponse.json({ count });
  } catch (error) {
    console.error(`[Admin review count] ${correlationId} failed:`, error);
    return genericApiError(correlationId);
  }
}
