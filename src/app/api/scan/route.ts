import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { verifyTicket } from '@/lib/qr/hmac';
import { verifyAuthToken, PRIMARY_ADMIN_EMAIL } from '@/lib/auth/guards';
import { getValidPasscode } from '@/app/api/scan/verify-passcode/route';
import { FieldValue } from 'firebase-admin/firestore';
import { getLimiter, limitByIp } from '@/lib/ratelimit';

/** Max allowed qrToken length — reject unbounded input before it reaches HMAC. */
const MAX_QR_TOKEN_LENGTH = 512;

/** Rate limiter for scans: 60 requests per minute per IP. */
const scanLimiter = getLimiter('scan', 60, '1 m');

/**
 * Constant-time passcode comparison.
 * Length-guard first (timingSafeEqual throws on mismatched lengths).
 */
function passcodeMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided.trim(), 'utf8');
  const b = Buffer.from(expected.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // Rate-limit scan attempts: 60 req/min per IP
  const limitedResponse = await limitByIp(request, scanLimiter);
  if (limitedResponse) {
    return limitedResponse;
  }

  // Check authorization via Usher Passcode header OR Firebase ID Token
  const passcodeHeader = request.headers.get('x-usher-passcode');
  let authorized = false;
  let usherId = 'usher-passcode';

  if (passcodeHeader) {
    const validPasscode = await getValidPasscode();
    if (passcodeMatches(passcodeHeader, validPasscode)) {
      authorized = true;
      usherId = 'usher-passcode';
      console.warn('[scan] Passcode-authenticated scan — no individual usher attribution. (See P0-5)');
    }
  }

  if (!authorized) {
    const decodedToken = await verifyAuthToken(request);
    if (decodedToken) {
      const userEmail = decodedToken.email?.toLowerCase();
      const isPrimaryAdmin = userEmail === PRIMARY_ADMIN_EMAIL.toLowerCase();
      const userRole = decodedToken.role || (isPrimaryAdmin ? 'admin' : undefined);
      if (userRole === 'admin' || userRole === 'usher') {
        authorized = true;
        usherId = decodedToken.uid;
      }
    }
  }

  if (!authorized) {
    return NextResponse.json(
      {
        type: 'invalid_ticket',
        message: 'Unauthorized',
        messageAr: 'غير مصرح — كود الماسح غير صحيح',
      },
      { status: 401 }
    );
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

    // Input length guard — reject unbounded strings before HMAC
    if (qrToken.length > MAX_QR_TOKEN_LENGTH) {
      return NextResponse.json(
        {
          type: 'tampered',
          message: 'QR code signature is invalid',
          messageAr: 'رمز QR غير صالح أو منتهي الصلاحية',
        },
        { status: 400 }
      );
    }

    // Step 1: Verify HMAC signature and extract ticketId
    const { valid, ticketId, isSigned } = verifyTicket(qrToken);

    if (!valid || !ticketId || !isSigned) {
      return NextResponse.json(
        {
          type: 'tampered',
          message: 'QR code signature is invalid',
          messageAr: 'رمز QR غير صالح أو منتهي الصلاحية',
        },
        { status: 400 }
      );
    }

    // Step 2: Atomic check-in via Firestore transaction
    const db = getAdminDb();

    // Check if ticket exists first
    let actualTicketId = ticketId;
    const ticketDocRef = db.collection('tickets').doc(ticketId);
    const directSnap = await ticketDocRef.get();

    if (!directSnap.exists) {
      const byRegSnap = await db.collection('tickets').where('registrantId', '==', ticketId).limit(1).get();
      if (!byRegSnap.empty) {
        actualTicketId = byRegSnap.docs[0].id;
      }
    }

    const result = await db.runTransaction(async (transaction) => {
      const targetTicketRef = db.collection('tickets').doc(actualTicketId);
      const ticketSnap = await transaction.get(targetTicketRef);

      if (!ticketSnap.exists) {
        return { type: 'invalid_ticket' as const };
      }

      const ticketData = ticketSnap.data()!;
      const regId = ticketData.registrantId || actualTicketId;

      // Get registrant info
      const regRef = db.collection('registrants').doc(regId);
      const regSnap = await transaction.get(regRef);
      const regData = regSnap.data();

      const registrantName = regData?.fullName || ticketData.registrantName || 'زائر';
      const church = regData?.church || ticketData.church || '';

      if (ticketData.used) {
        return {
          type: 'already_used' as const,
          usedAt: ticketData.usedAt?.toDate?.()?.toISOString() || null,
          registrantName,
          church,
        };
      }

      // Mark as used atomically
      transaction.update(targetTicketRef, {
        used: true,
        usedAt: FieldValue.serverTimestamp(),
        usedByUsherId: usherId,
      });

      return {
        type: 'success' as const,
        registrantName,
        church,
      };
    });

    switch (result.type) {
      case 'success':
        return NextResponse.json({
          type: 'success',
          registrantName: result.registrantName,
          church: result.church,
          message: 'Check-in successful',
          messageAr: 'تم الدخول بنجاح ✓',
        });

      case 'already_used':
        return NextResponse.json({
          type: 'already_used',
          registrantName: result.registrantName,
          church: result.church,
          usedAt: result.usedAt,
          message: 'Ticket already used',
          messageAr: 'تنبيه: التذكرة مستعملة من قبل!',
        });

      case 'invalid_ticket':
        return NextResponse.json(
          {
            type: 'invalid_ticket',
            message: 'Ticket not found',
            messageAr: 'التذكرة غير موجودة في النظام',
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
        messageAr: 'حدث خطأ في النظام — حاول مرة أخرى',
      },
      { status: 500 }
    );
  }
}
