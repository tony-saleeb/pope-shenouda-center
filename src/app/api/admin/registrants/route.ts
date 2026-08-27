import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';

export const runtime = 'nodejs';

type TimestampLike = { toDate?: () => Date };

function toIso(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const toDate = (value as TimestampLike).toDate;
  if (typeof toDate !== 'function') return null;
  const date = toDate.call(value);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

/**
 * Lightweight catalog of every registrant — no payment screenshots.
 * Used by the admin list so search can run across the full set.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const correlationId = randomUUID();

  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection('registrants')
      .select(
        'fullName',
        'phoneNumber',
        'whatsappNumber',
        'church',
        'status',
        'ocrExtractedReference',
        'createdAt'
      )
      .get();

    const items = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        fullName: typeof data.fullName === 'string' ? data.fullName : '',
        phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : '',
        whatsappNumber: typeof data.whatsappNumber === 'string' ? data.whatsappNumber : '',
        church: typeof data.church === 'string' ? data.church : '',
        status: typeof data.status === 'string' ? data.status : 'pending_verification',
        ocrExtractedReference:
          typeof data.ocrExtractedReference === 'string' ? data.ocrExtractedReference : null,
        createdAt: toIso(data.createdAt),
      };
    });

    items.sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error(`[Admin registrants list] ${correlationId} failed:`, error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        messageAr: 'حدث خطأ، برجاء المحاولة مرة أخرى',
        correlationId,
      },
      { status: 500 }
    );
  }
}
