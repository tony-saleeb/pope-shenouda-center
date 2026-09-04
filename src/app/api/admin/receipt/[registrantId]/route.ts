import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { getReceiptReadUrl } from '@/lib/firebase/receipts';
import { genericApiError } from '@/lib/http/apiError';
import { safeImageSrc } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ registrantId: string }> }
) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const correlationId = randomUUID();

  try {
    const { registrantId } = await params;
    if (!registrantId) {
      return NextResponse.json({ error: 'Missing registrantId' }, { status: 400 });
    }

    const snap = await getAdminDb().collection('registrants').doc(registrantId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const stored = snap.data()?.paymentScreenshotUrl;
    const url = await getReceiptReadUrl(typeof stored === 'string' ? stored : null);
    const safeUrl = safeImageSrc(url);

    if (!safeUrl) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ url: safeUrl });
  } catch (error) {
    console.error(`[Admin receipt] ${correlationId} failed:`, error);
    return genericApiError(correlationId);
  }
}
