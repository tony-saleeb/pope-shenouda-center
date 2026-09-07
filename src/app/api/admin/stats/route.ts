import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { Query } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { getAdminReadCache, setAdminReadCache } from '@/lib/adminReadCache';
import { genericApiError } from '@/lib/http/apiError';

export const runtime = 'nodejs';

async function countQuery(query: Query): Promise<number> {
  const snap = await query.count().get();
  return snap.data().count;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const correlationId = randomUUID();
  const cached = getAdminReadCache<{
    total: number;
    pending: number;
    review: number;
    approved: number;
    rejected: number;
    checkedIn: number;
  }>('stats');
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const db = getAdminDb();
    const registrants = db.collection('registrants');
    const tickets = db.collection('tickets');

    const [total, pending, review, approved, autoApproved, rejected, checkedIn] = await Promise.all([
      countQuery(registrants),
      countQuery(registrants.where('status', '==', 'pending_verification')),
      countQuery(registrants.where('status', '==', 'manual_review')),
      countQuery(registrants.where('status', '==', 'approved')),
      countQuery(registrants.where('status', '==', 'auto_approved')),
      countQuery(registrants.where('status', '==', 'rejected')),
      countQuery(tickets.where('used', '==', true)),
    ]);

    const payload = {
      total,
      pending,
      review,
      approved: approved + autoApproved,
      rejected,
      checkedIn,
    };
    setAdminReadCache('stats', payload, 15_000);
    return NextResponse.json(payload);
  } catch (error) {
    console.error(`[Admin stats] ${correlationId} failed:`, error);
    return genericApiError(correlationId);
  }
}
