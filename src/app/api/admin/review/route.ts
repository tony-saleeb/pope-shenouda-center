import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { getReceiptReadUrl } from '@/lib/firebase/receipts';
import { genericApiError } from '@/lib/http/apiError';
import { APPROVED_STATUSES, PENDING_REVIEW_STATUSES } from '@/lib/registrantStatus';
import type { FeeCurrency, RegistrationTrack } from '@/lib/registrationTracks';
import type { Registrant, RegistrantStatus } from '@/lib/types';

export const runtime = 'nodejs';

const PAGE_SIZE = 20;

type TimestampLike = { toDate?: () => Date };

function toIso(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const toDate = (value as TimestampLike).toDate;
  if (typeof toDate !== 'function') return null;
  const date = toDate.call(value);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function asStatus(value: unknown): RegistrantStatus {
  if (
    value === 'pending_verification' ||
    value === 'auto_approved' ||
    value === 'manual_review' ||
    value === 'approved' ||
    value === 'rejected'
  ) {
    return value;
  }
  return 'pending_verification';
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const correlationId = randomUUID();

  try {
    const tab = request.nextUrl.searchParams.get('tab') === 'approved' ? 'approved' : 'pending';
    const cursor = request.nextUrl.searchParams.get('cursor');
    const statuses = tab === 'pending' ? PENDING_REVIEW_STATUSES : APPROVED_STATUSES;

    const db = getAdminDb();
    let query = db
      .collection('registrants')
      .where('status', 'in', statuses)
      .orderBy('createdAt', 'desc')
      .limit(PAGE_SIZE + 1);

    if (cursor) {
      const cursorSnap = await db.collection('registrants').doc(cursor).get();
      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    const snapshot = await query.get();
    const pageDocs = snapshot.docs.slice(0, PAGE_SIZE);
    const hasMore = snapshot.docs.length > PAGE_SIZE;

    const items = await Promise.all(
      pageDocs.map(async (docSnap) => {
        const data = docSnap.data();
        const receiptUrl = await getReceiptReadUrl(
          typeof data.paymentScreenshotUrl === 'string' ? data.paymentScreenshotUrl : null
        );

        const payload: Registrant = {
          fullName: typeof data.fullName === 'string' ? data.fullName : '',
          phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : '',
          whatsappNumber: typeof data.whatsappNumber === 'string' ? data.whatsappNumber : '',
          church: typeof data.church === 'string' ? data.church : '',
          paymentScreenshotUrl: receiptUrl || '',
          status: asStatus(data.status),
          adminNotes: typeof data.adminNotes === 'string' ? data.adminNotes : null,
          createdAt: data.createdAt as Registrant['createdAt'],
          verifiedAt: (data.verifiedAt ?? null) as Registrant['verifiedAt'],
          track: (typeof data.track === 'string' ? data.track : null) as RegistrationTrack | null,
          feeAmount: typeof data.feeAmount === 'number' ? data.feeAmount : null,
          feeCurrency: (typeof data.feeCurrency === 'string' ? data.feeCurrency : null) as FeeCurrency | null,
          countryDial: typeof data.countryDial === 'string' ? data.countryDial : null,
        };

        return { id: docSnap.id, data: payload, createdAt: toIso(data.createdAt) };
      })
    );

    return NextResponse.json({
      items,
      nextCursor: hasMore ? pageDocs[pageDocs.length - 1]?.id ?? null : null,
    });
  } catch (error) {
    console.error(`[Admin review] ${correlationId} failed:`, error);
    return genericApiError(correlationId);
  }
}
