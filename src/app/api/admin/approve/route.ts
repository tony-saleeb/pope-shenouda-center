import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { FieldValue } from 'firebase-admin/firestore';
import { issueAttendanceTicket } from '@/lib/qr/issueAttendanceTicket';
import { trackRequiresAttendanceQr } from '@/lib/registrationTracks';
import { sendAutomatedWhatsAppTicket } from '@/lib/whatsapp/api';

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    const { registrantId, notes } = await request.json();

    if (!registrantId) {
      return NextResponse.json({ error: 'Missing registrantId' }, { status: 400 });
    }

    const db = getAdminDb();
    const registrantRef = db.collection('registrants').doc(registrantId);
    const regSnap = await registrantRef.get();

    if (!regSnap.exists) {
      return NextResponse.json({ error: 'Registrant not found' }, { status: 404 });
    }

    const regData = regSnap.data()!;
    const issuesAttendanceQr = trackRequiresAttendanceQr(regData.track);

    await registrantRef.update({
      status: 'approved',
      verifiedAt: FieldValue.serverTimestamp(),
      adminNotes: notes || null,
      ocrStatus: 'skipped',
    });

    let whatsappSent = false;

    if (issuesAttendanceQr) {
      await issueAttendanceTicket(db, registrantId);

      const targetPhone = regData.whatsappNumber || regData.phoneNumber || '';
      const whatsappResult = await sendAutomatedWhatsAppTicket(targetPhone, registrantId);
      whatsappSent = whatsappResult.sent;
    }

    return NextResponse.json({
      success: true,
      message: issuesAttendanceQr
        ? 'Registrant approved and attendance QR generated'
        : 'Registrant approved without attendance QR (track is not onsite)',
      attendanceQrIssued: issuesAttendanceQr,
      whatsappSent,
    });
  } catch (error) {
    console.error('Approve error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `خطأ في تنفيذ الموافقة: ${errorMessage}` }, { status: 500 });
  }
}
