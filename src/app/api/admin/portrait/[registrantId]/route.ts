import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/auth/guards';
import { getPortraitPayloadForRegistrant } from '@/lib/firebase/receipts';
import { genericApiError } from '@/lib/http/apiError';
import { storedImageResponse } from '@/lib/http/storedImageResponse';

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

    const payload = await getPortraitPayloadForRegistrant(registrantId);
    return storedImageResponse(payload);
  } catch (error) {
    console.error(`[Admin portrait] ${correlationId} failed:`, error);
    return genericApiError(correlationId);
  }
}
