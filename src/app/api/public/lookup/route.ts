/**
 * Public Ticket Lookup API.
 *
 * SECURITY NOTE: Direct client-side phoneIndex lookups let any anonymous user steal
 * attendee tickets and bulk-enumerate registrant phone numbers. This route replaces
 * redirect-on-lookup with send-ticket-to-registered-whatsapp.
 *
 * OTP verification is the stronger long-term control; sending the link to WhatsApp
 * removes the direct leak by requiring possession of the registered phone.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { isValidEgyptianPhone, normalizePhone, VALIDATION_MESSAGES } from '@/lib/validation';
import { sendAutomatedWhatsAppTicket } from '@/lib/whatsapp/api';
import { getLimiter, limitByIp } from '@/lib/ratelimit';

/** Anti-enumeration message: identical response returned regardless of registration existence. */
const ANTI_ENUMERATION_MESSAGE = 'لو الرقم مسجّل عندنا، هيوصلك رابط التذكرة على الواتساب خلال دقائق.';

/** Rate limiters: 3 req / 15m per IP, and 3 req / 1h per phone number. */
const lookupIpLimiter = getLimiter('public-lookup-ip', 3, '15 m');
const lookupPhoneLimiter = getLimiter('public-lookup-phone', 3, '1 h');

export async function POST(request: NextRequest) {
  // 1. IP Rate Limiting
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

    const normalized = normalizePhone(phone);

    if (!isValidEgyptianPhone(normalized)) {
      return NextResponse.json(
        { error: 'Invalid phone format', messageAr: VALIDATION_MESSAGES.phoneInvalid },
        { status: 400 }
      );
    }

    // 2. Phone Number Rate Limiting (3 per hour per phone)
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

    // 3. Lookup phone index via Admin SDK
    const db = getAdminDb();
    const phoneSnap = await db.collection('phoneIndex').doc(normalized).get();

    if (phoneSnap.exists) {
      const registrantId = phoneSnap.data()?.registrantId;
      console.log(`[Public Lookup] Found registrant ${registrantId} for phone ${normalized}`);

      if (registrantId) {
        try {
          await sendAutomatedWhatsAppTicket(normalized, registrantId);
        } catch (sendErr) {
          console.error(`[Public Lookup] Failed sending WhatsApp ticket for ${registrantId}:`, sendErr);
        }
      }
    } else {
      console.log(`[Public Lookup] Phone ${normalized} not found in phoneIndex`);
    }

    // 4. Anti-enumeration: ALWAYS return identical 200 response
    return NextResponse.json({
      success: true,
      messageAr: ANTI_ENUMERATION_MESSAGE,
    });
  } catch (error) {
    console.error('[Public Lookup] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', messageAr: 'حدث خطأ، برجاء المحاولة مرة أخرى' },
      { status: 500 }
    );
  }
}
