import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { signTicket } from '@/lib/qr/hmac';
import { FieldValue } from 'firebase-admin/firestore';
import { generateQrCodeDataUrl } from '@/lib/qr/generator';
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

    // Update registrant status
    const db = getAdminDb();
    const registrantRef = db.collection('registrants').doc(registrantId);
    const regSnap = await registrantRef.get();

    if (!regSnap.exists) {
      return NextResponse.json({ error: 'Registrant not found' }, { status: 404 });
    }

    const regData = regSnap.data()!;

    // ocrStatus leaves the queue so the nightly OCR run cannot revisit this decision.
    await registrantRef.update({
      status: 'approved',
      verifiedAt: FieldValue.serverTimestamp(),
      adminNotes: notes || null,
      ocrStatus: 'skipped',
    });

    // Generate ticket QR code
    const qrToken = signTicket(registrantId);
    const qrDataUrl = await generateQrCodeDataUrl(registrantId);

    // Store ticket document
    const ticketRef = db.collection('tickets').doc(registrantId);
    await ticketRef.set({
      qrToken,
      qrImageUrl: qrDataUrl,
      used: false,
      usedAt: null,
      usedByUsherId: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Background Automated WhatsApp Send attempt
    const targetPhone = regData.whatsappNumber || regData.phoneNumber || '';
    const whatsappResult = await sendAutomatedWhatsAppTicket(targetPhone, registrantId);

    return NextResponse.json({
      success: true,
      message: 'Registrant approved and ticket generated',
      whatsappSent: whatsappResult.sent,
    });
  } catch (error) {
    console.error('Approve error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `خطأ في تنفيذ الموافقة: ${errorMessage}` }, { status: 500 });
  }
}
