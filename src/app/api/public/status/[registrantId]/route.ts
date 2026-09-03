import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { getLimiter, limitByIp } from '@/lib/ratelimit';
import { isRegistrationTrack, trackRequiresAttendanceQr } from '@/lib/registrationTracks';

/** Rate limiter for public status endpoint: 30 requests per minute per IP. */
const statusLimiter = getLimiter('public-status', 30, '1 m');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ registrantId: string }> }
) {
  const limitedResponse = await limitByIp(request, statusLimiter);
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
    const docSnap = await db.collection('registrants').doc(registrantId).get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: 'Not found', messageAr: 'لم يتم العثور على هذا التسجيل' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const data = docSnap.data()!;
    const track = isRegistrationTrack(data.track) ? data.track : null;

    // Return ONLY safe public status fields — NEVER expose PII (phoneNumber, whatsappNumber, receipts, etc.)
    return NextResponse.json(
      {
        status: data.status,
        fullName: data.fullName,
        church: data.church,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        track,
        attendanceQrRequired: trackRequiresAttendanceQr(track),
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    console.error('Error in public status API:', error);
    return NextResponse.json(
      { error: 'Internal server error', messageAr: 'حدث خطأ في النظام' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
