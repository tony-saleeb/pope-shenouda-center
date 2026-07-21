import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { verifyTicket } from '@/lib/qr/hmac';
import { requireUsher } from '@/lib/auth/guards';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  // Verify usher/admin auth
  const authResult = await requireUsher(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    const { qrToken } = await request.json();

    if (!qrToken || typeof qrToken !== 'string') {
      return NextResponse.json(
        {
          type: 'invalid_ticket',
          message: 'Invalid QR code data',
          messageAr: 'رمز QR غير صالح',
        },
        { status: 400 }
      );
    }

    // Step 1: Verify HMAC signature
    const { valid, ticketId } = verifyTicket(qrToken);

    if (!valid || !ticketId) {
      return NextResponse.json(
        {
          type: 'tampered',
          message: 'QR code signature is invalid — possible tampering',
          messageAr: 'غير صالح — رمز QR مزوّر',
        },
        { status: 403 }
      );
    }

    // Step 2: Atomic check-in via Firestore transaction
    const db = getAdminDb();
    const result = await db.runTransaction(async (transaction) => {
      const ticketRef = db.collection('tickets').doc(ticketId);
      const ticketSnap = await transaction.get(ticketRef);

      if (!ticketSnap.exists) {
        return { type: 'invalid_ticket' as const };
      }

      const ticketData = ticketSnap.data()!;

      if (ticketData.used) {
        return {
          type: 'already_used' as const,
          usedAt: ticketData.usedAt?.toDate?.()?.toISOString() || null,
        };
      }

      // Mark as used atomically
      transaction.update(ticketRef, {
        used: true,
        usedAt: FieldValue.serverTimestamp(),
        usedByUsherId: authResult.uid,
      });

      // Get registrant info for the success response
      const regRef = db.collection('registrants').doc(ticketId);
      const regSnap = await transaction.get(regRef);
      const regData = regSnap.data();

      return {
        type: 'success' as const,
        registrantName: regData?.fullName || 'Unknown',
        church: regData?.church || 'Unknown',
      };
    });

    switch (result.type) {
      case 'success':
        return NextResponse.json({
          type: 'success',
          registrantName: result.registrantName,
          church: result.church,
          message: 'Check-in successful',
          messageAr: 'تم الدخول بنجاح',
        });

      case 'already_used':
        return NextResponse.json(
          {
            type: 'already_used',
            usedAt: result.usedAt,
            message: 'Ticket already used',
            messageAr: 'تم الدخول من قبل',
          },
          { status: 409 }
        );

      case 'invalid_ticket':
        return NextResponse.json(
          {
            type: 'invalid_ticket',
            message: 'Ticket not found',
            messageAr: 'التذكرة غير موجودة',
          },
          { status: 404 }
        );
    }
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json(
      {
        type: 'error',
        message: 'Internal server error',
        messageAr: 'حدث خطأ — حاول مرة أخرى',
      },
      { status: 500 }
    );
  }
}
