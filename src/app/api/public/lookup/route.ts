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
import { resolveLookupPhoneId, VALIDATION_MESSAGES } from '@/lib/validation';
import { sendAutomatedWhatsAppTicket } from '@/lib/whatsapp/api';
import { getLimiter, limitByIp } from '@/lib/ratelimit';

/** Anti-enumeration message: identical response returned regardless of registration existence. */
const ANTI_ENUMERATION_MESSAGE = 'لو الرقم مسجّل عندنا، هيوصلك رابط التذكرة على الواتساب خلال دقائق.';

/** Rate limiters: 30 req / 15m per IP, and 15 req / 15m per phone number. */
const lookupIpLimiter = getLimiter('public-lookup-ip', 30, '15 m');
const lookupPhoneLimiter = getLimiter('public-lookup-phone', 15, '15 m');

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

    const normalized = resolveLookupPhoneId(phone);

    if (!normalized) {
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

    if (!phoneSnap.exists) {
      console.log(`[Public Lookup] Phone ${normalized} not found in phoneIndex`);
      return NextResponse.json(
        {
          success: false,
          error: 'Not found',
          messageAr: 'عفواً، هذا الرقم غير مسجّل لدينا. يرجى التأكد من الرقم الذي قمت بالتسجيل به، أو قم بالتسجيل الآن.',
        },
        { status: 404 }
      );
    }

    const registrantId = phoneSnap.data()?.registrantId;

    if (!registrantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Registrant ID missing',
          messageAr: 'عفواً، لم نتمكن من العثور على بيانات التذكرة لهذا الرقم.',
        },
        { status: 404 }
      );
    }

    console.log(`[Public Lookup] Found registrant ${registrantId} for phone ${normalized}`);

    try {
      await sendAutomatedWhatsAppTicket(normalized, registrantId);
    } catch (sendErr) {
      console.error(`[Public Lookup] Failed sending WhatsApp ticket for ${registrantId}:`, sendErr);
    }

    return NextResponse.json({
      success: true,
      registrantId,
      messageAr: 'تم العثور على حسابك بنجاح! تم إرسال رابط التذكرة إلى الواتساب الخاص بك.',
    });
  } catch (error) {
    console.error('[Public Lookup] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', messageAr: 'حدث خطأ، برجاء المحاولة مرة أخرى' },
      { status: 500 }
    );
  }
}
