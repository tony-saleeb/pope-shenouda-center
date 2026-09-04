import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { deleteRegistrantReceipt } from '@/lib/firebase/receipts';
import { genericApiError } from '@/lib/http/apiError';
import { scheduleReviewQueueSync } from '@/lib/reviewQueue';

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const correlationId = randomUUID();

  try {
    const { registrantId } = await request.json();

    if (!registrantId) {
      return NextResponse.json({ error: 'Missing registrantId' }, { status: 400 });
    }

    const db = getAdminDb();
    const registrantRef = db.collection('registrants').doc(registrantId);
    const regSnap = await registrantRef.get();

    if (!regSnap.exists) {
      return NextResponse.json({ error: 'Registrant not found' }, { status: 404 });
    }

    const regData = regSnap.data();
    const batch = db.batch();

    // Delete registrant document
    batch.delete(registrantRef);

    // Delete associated ticket if exists
    const ticketRef = db.collection('tickets').doc(registrantId);
    const ticketSnap = await ticketRef.get();
    if (ticketSnap.exists) {
      batch.delete(ticketRef);
    }

    // Delete phone index entry
    if (regData?.phoneNumber) {
      const phoneRef = db.collection('phoneIndex').doc(regData.phoneNumber);
      const phoneSnap = await phoneRef.get();
      if (phoneSnap.exists) {
        batch.delete(phoneRef);
      }
    }

    await batch.commit();
    await deleteRegistrantReceipt(
      typeof regData?.paymentScreenshotUrl === 'string' ? regData.paymentScreenshotUrl : null
    );

    scheduleReviewQueueSync(db);

    return NextResponse.json({
      success: true,
      message: 'Registrant and associated data deleted successfully',
    });
  } catch (error) {
    console.error(`[Delete] ${correlationId} failed:`, error);
    return genericApiError(correlationId, 'حدث خطأ أثناء حذف المسجّل');
  }
}
