/**
 * Public Registration API.
 *
 * Firestore rules deny client-side creates on `registrants` and `phoneIndex`, so this
 * route is the only path that can create a registration. All validation is re-run
 * server-side because the browser checks are advisory only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  MAX_STORED_RECEIPT_BYTES,
  receiptPointer,
  receiptWriteFields,
} from '@/lib/firebase/receipts';
import {
  isValidEgyptianPhone,
  isValidInternationalPhone,
  isValidName,
  normalizePhone,
  sanitizeNationalPhoneInput,
  VALIDATION_MESSAGES,
} from '@/lib/validation';
import { isKnownDialCode } from '@/lib/countries';
import { isRegistrationTrack, TRACKS } from '@/lib/registrationTracks';
import { getLimiter, limitByIp } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const MAX_NAME_LENGTH = 100;
const MAX_CHURCH_LENGTH = 120;

/** 5 registrations / hour per IP — families often register from one connection. */
const registerIpLimiter = getLimiter('register-ip', 5, '60 m');

/** Detect the real image type from magic bytes. Client Content-Type is not trusted. */
function sniffImageMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function badRequest(messageAr: string) {
  return NextResponse.json({ error: 'Invalid request', messageAr }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const correlationId = randomUUID();

  try {
    const limitedResponse = await limitByIp(request, registerIpLimiter);
    if (limitedResponse) {
      return limitedResponse;
    }

    const form = await request.formData();

    const fullNameRaw = form.get('fullName');
    const churchRaw = form.get('church');
    const phoneRaw = form.get('phoneNumber');
    const whatsappRaw = form.get('whatsappNumber');
    const trackRaw = form.get('track');
    const countryDialRaw = form.get('countryDial');
    const screenshot = form.get('screenshot');

    if (typeof fullNameRaw !== 'string' || typeof churchRaw !== 'string') {
      return badRequest(VALIDATION_MESSAGES.nameRequired);
    }
    if (typeof phoneRaw !== 'string' || typeof whatsappRaw !== 'string') {
      return badRequest(VALIDATION_MESSAGES.phoneRequired);
    }
    if (typeof trackRaw !== 'string' || !isRegistrationTrack(trackRaw)) {
      return badRequest(VALIDATION_MESSAGES.trackRequired);
    }

    const track = TRACKS[trackRaw];
    const isAbroad = track.id === 'abroad';
    const countryDial = typeof countryDialRaw === 'string' ? countryDialRaw.trim() : '';

    const fullName = fullNameRaw.trim().replace(/\s+/g, ' ');
    const church = churchRaw.trim().replace(/\s+/g, ' ');

    if (!isValidName(fullName) || fullName.length > MAX_NAME_LENGTH) {
      return badRequest(VALIDATION_MESSAGES.nameTooShort);
    }
    if (church.length < 2 || church.length > MAX_CHURCH_LENGTH) {
      return badRequest(VALIDATION_MESSAGES.churchRequired);
    }

    let phoneNumber: string;
    let whatsappNumber: string;

    if (isAbroad) {
      if (!isKnownDialCode(countryDial)) {
        return badRequest(VALIDATION_MESSAGES.countryRequired);
      }
      if (!isValidInternationalPhone(countryDial, phoneRaw)) {
        return badRequest(VALIDATION_MESSAGES.intlPhoneInvalid);
      }
      phoneNumber = `${countryDial}${sanitizeNationalPhoneInput(phoneRaw)}`;
      if (!isValidInternationalPhone(countryDial, whatsappRaw)) {
        return badRequest(VALIDATION_MESSAGES.intlPhoneInvalid);
      }
      whatsappNumber = `${countryDial}${sanitizeNationalPhoneInput(whatsappRaw)}`;
    } else {
      phoneNumber = normalizePhone(phoneRaw);
      if (!isValidEgyptianPhone(phoneNumber)) {
        return badRequest(VALIDATION_MESSAGES.phoneInvalid);
      }
      whatsappNumber = normalizePhone(whatsappRaw);
      if (!isValidEgyptianPhone(whatsappNumber)) {
        return badRequest(VALIDATION_MESSAGES.whatsappInvalid);
      }
    }

    if (!(screenshot instanceof File) || screenshot.size === 0) {
      return badRequest(VALIDATION_MESSAGES.screenshotRequired);
    }
    if (screenshot.size > MAX_SCREENSHOT_BYTES) {
      return badRequest(VALIDATION_MESSAGES.uploadFailed);
    }

    const bytes = new Uint8Array(await screenshot.arrayBuffer());
    const mimeType = sniffImageMime(bytes);
    if (!mimeType) {
      return badRequest(VALIDATION_MESSAGES.screenshotRequired);
    }

    if (bytes.byteLength > MAX_STORED_RECEIPT_BYTES) {
      return badRequest(VALIDATION_MESSAGES.uploadFailed);
    }

    const registrantId = randomUUID();
    const paymentScreenshotUrl = receiptPointer(registrantId);
    const receiptFields = receiptWriteFields(bytes, mimeType);
    const db = getAdminDb();

    try {
      await db.runTransaction(async (transaction) => {
        const phoneRef = db.collection('phoneIndex').doc(phoneNumber);
        const phoneSnap = await transaction.get(phoneRef);

        if (phoneSnap.exists) {
          throw new Error('DUPLICATE_PHONE');
        }

        transaction.set(db.collection('receipts').doc(registrantId), receiptFields);

        transaction.set(db.collection('registrants').doc(registrantId), {
          fullName,
          phoneNumber,
          whatsappNumber,
          church,
          track: track.id,
          feeAmount: track.amount,
          feeCurrency: track.currency,
          countryDial: isAbroad ? countryDial : null,
          paymentScreenshotUrl,
          status: 'pending_verification',
          adminNotes: null,
          createdAt: FieldValue.serverTimestamp(),
          verifiedAt: null,
        });

        transaction.set(phoneRef, { registrantId });
      });
    } catch (txError) {
      if (txError instanceof Error && txError.message === 'DUPLICATE_PHONE') {
        return NextResponse.json(
          {
            error: 'DUPLICATE_PHONE',
            messageAr: VALIDATION_MESSAGES.duplicatePhone,
          },
          { status: 409 }
        );
      }
      throw txError;
    }

    return NextResponse.json({ success: true, registrantId });
  } catch (error) {
    console.error(`[Register] ${correlationId} failed:`, error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        messageAr: VALIDATION_MESSAGES.genericError,
        correlationId,
      },
      { status: 500 }
    );
  }
}
