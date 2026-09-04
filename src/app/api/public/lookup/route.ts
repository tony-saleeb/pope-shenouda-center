/**
 * Public Ticket Lookup API.
 *
 * Always returns the same 200 body for a valid phone so callers cannot
 * enumerate who is registered. Attendance QR is sent to WhatsApp only
 * for the onsite (انتظامي) track, and never includes registrantId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { resolveLookupPhoneId, VALIDATION_MESSAGES } from '@/lib/validation';
import { trackRequiresAttendanceQr } from '@/lib/registrationTracks';
import { sendAutomatedWhatsAppTicket } from '@/lib/whatsapp/api';
import { getLimiter, limitByIp } from '@/lib/ratelimit';

/** Anti-enumeration message: identical response returned regardless of registration existence. */
const ANTI_ENUMERATION_MESSAGE =
  'لو الرقم مسجّل عندنا، هيوصلك رابط كود الحضور (QR) على الواتساب خلال دقائق.';

function antiEnumerationResponse() {
  return NextResponse.json({
    success: true,
    messageAr: ANTI_ENUMERATION_MESSAGE,
  });
}

/** Rate limiters: 30 req / 15m per IP, and 15 req / 15m per phone number. */
const lookupIpLimiter = getLimiter('public-lookup-ip', 30, '15 m');
const lookupPhoneLimiter = getLimiter('public-lookup-phone', 15, '15 m');

export async function POST(request: NextRequest) {
  const limitedIpResponse = await limitByIp(request, lookupIpLimiter);
  if (limitedIpResponse) {
    return limitedIpResponse;
  }

  try {
    const body = await request.json();
    const phone = body?.phone;

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { error: 'Phone required', messageAr: VALIDATION_MESSAGES.phoneRequired },
        { status: 400 }
      );
    }

    const normalized = resolveLookupPhoneId(phone);

    if (!normalized) {
      return NextResponse.json(
        { error: 'Invalid phone format', messageAr: VALIDATION_MESSAGES.phoneInvalid },
        { status: 400 }
      );
    }

    const { success: phoneSuccess, reset: phoneReset } = await lookupPhoneLimiter.limit(normalized);
    if (!phoneSuccess) {
      const retryAfterSeconds = Math.ceil(Math.max(0, phoneReset - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: 'Too many requests',
          messageAr: 'محاولات كثيرة، برجاء المحاولة بعد قليل',
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSeconds) },
        }
      );
    }

    const db = getAdminDb();
    const phoneSnap = await db.collection('phoneIndex').doc(normalized).get();

    if (!phoneSnap.exists) {
      return antiEnumerationResponse();
    }

    const registrantId = phoneSnap.data()?.registrantId;
    if (typeof registrantId !== 'string' || !registrantId) {
      return antiEnumerationResponse();
    }

    const regSnap = await db.collection('registrants').doc(registrantId).get();
    const track = regSnap.data()?.track;

    if (trackRequiresAttendanceQr(track)) {
      try {
        await sendAutomatedWhatsAppTicket(normalized, registrantId);
      } catch (sendErr) {
        console.error('[Public Lookup] Failed sending WhatsApp ticket:', sendErr);
      }
    }

    return antiEnumerationResponse();
  } catch (error) {
    console.error('[Public Lookup] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', messageAr: 'حدث خطأ، برجاء المحاولة مرة أخرى' },
      { status: 500 }
    );
  }
}
