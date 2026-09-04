import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { FieldValue } from 'firebase-admin/firestore';
import { genericApiError } from '@/lib/http/apiError';

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const correlationId = randomUUID();

  try {
    const { registrantId, reason } = await request.json();

    if (!registrantId) {
      return NextResponse.json({ error: 'Missing registrantId' }, { status: 400 });
    }

    const db = getAdminDb();
    const registrantRef = db.collection('registrants').doc(registrantId);
    const regSnap = await registrantRef.get();

    if (!regSnap.exists) {
      return NextResponse.json({ error: 'Registrant not found' }, { status: 404 });
    }

    await registrantRef.update({
      status: 'rejected',
      verifiedAt: FieldValue.serverTimestamp(),
      adminNotes: reason || 'Rejected by admin',
    });

    return NextResponse.json({
      success: true,
      message: 'Registrant rejected',
    });
  } catch (error) {
    console.error(`[Reject] ${correlationId} failed:`, error);
    return genericApiError(correlationId, 'حدث خطأ أثناء تنفيذ الرفض');
  }
}
