import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { signTicket } from '@/lib/qr/hmac';
import { FieldValue } from 'firebase-admin/firestore';
import { generateQrCodeDataUrl } from '@/lib/qr/generator';

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

    await registrantRef.update({
      status: 'approved',
      verifiedAt: FieldValue.serverTimestamp(),
      adminNotes: notes || null,
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

    // TODO: Trigger WhatsApp delivery here when API is configured

    return NextResponse.json({
      success: true,
      message: 'Registrant approved and ticket generated',
    });
  } catch (error) {
    console.error('Approve error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
