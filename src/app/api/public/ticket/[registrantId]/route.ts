import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { getLimiter, limitByIp } from '@/lib/ratelimit';

/** Rate limiter for public ticket endpoint: 30 requests per minute per IP. */
const ticketLimiter = getLimiter('public-ticket', 30, '1 m');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ registrantId: string }> }
) {
  const limitedResponse = await limitByIp(request, ticketLimiter);
  if (limitedResponse) {
    return limitedResponse;
  }

  try {
    const { registrantId } = await params;
    if (!registrantId) {
      return NextResponse.json(
        { error: 'Registrant ID required', messageAr: 'معرّف التسجيل مفقود' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const db = getAdminDb();
    const regSnap = await db.collection('registrants').doc(registrantId).get();

    if (!regSnap.exists) {
      return NextResponse.json(
        { error: 'Not found', messageAr: 'لم يتم العثور على التسجيل' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const regData = regSnap.data()!;

    if (regData.status !== 'approved' && regData.status !== 'auto_approved') {
      return NextResponse.json(
        {
          error: 'Not approved',
          messageAr: 'التسجيل غير مقبول بعد — التذكرة تظهر فقط للطلبات المقبولة',
        },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const ticketSnap = await db.collection('tickets').doc(registrantId).get();

    if (!ticketSnap.exists) {
      return NextResponse.json(
        { error: 'Ticket not found', messageAr: 'التذكرة لم تُصدر بعد' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const ticketData = ticketSnap.data()!;

    // Return ONLY safe public ticket fields — NEVER return raw qrToken
    return NextResponse.json(
      {
        fullName: regData.fullName,
        church: regData.church,
        qrImageUrl: ticketData.qrImageUrl,
        used: Boolean(ticketData.used),
        usedAt: ticketData.usedAt?.toDate?.()?.toISOString() || null,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    console.error('Error in public ticket API:', error);
    return NextResponse.json(
      { error: 'Internal server error', messageAr: 'حدث خطأ في تحميل التذكرة' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
