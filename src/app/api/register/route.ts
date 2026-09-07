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
  PORTRAITS_COLLECTION,
  RECEIPTS_COLLECTION,
  portraitPointer,
  portraitWriteFields,
  receiptPointer,
  receiptWriteFields,
} from '@/lib/firebase/receipts';
import {
  isValidEgyptianNationalId,
  isValidEgyptianPhone,
  isValidEmail,
  isValidInternationalPhone,
  isValidName,
  isValidShortText,
  normalizePhone,
  normalizeShortText,
  sanitizeNationalIdInput,
  sanitizeNationalPhoneInput,
  VALIDATION_MESSAGES,
} from '@/lib/validation';
import { isKnownDialCode } from '@/lib/countries';
import { isRegistrationTrack, TRACKS } from '@/lib/registrationTracks';
import { getLimiter, limitByIp } from '@/lib/ratelimit';
import { scheduleReviewQueueSync } from '@/lib/reviewQueue';
import { invalidateAdminReadCache } from '@/lib/adminReadCache';

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

async function readStoredImage(
  file: FormDataEntryValue | null,
  missingMessage: string
): Promise<
  | { bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }
  | NextResponse
> {
  if (!(file instanceof File) || file.size === 0) {
    return badRequest(missingMessage);
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return badRequest(VALIDATION_MESSAGES.uploadFailed);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffImageMime(bytes);
  if (!mimeType) {
    return badRequest(missingMessage);
  }
  if (bytes.byteLength > MAX_STORED_RECEIPT_BYTES) {
    return badRequest(VALIDATION_MESSAGES.uploadFailed);
  }
  return { bytes, mimeType };
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
    const nationalIdRaw = form.get('nationalId');
    const emailRaw = form.get('email');
    const churchRaw = form.get('church');
    const eparchyRaw = form.get('eparchy');
    const confessionFatherRaw = form.get('confessionFather');
    const confessionFatherChurchRaw = form.get('confessionFatherChurch');
    const currentServiceRaw = form.get('currentService');
    const phoneRaw = form.get('phoneNumber');
    const whatsappRaw = form.get('whatsappNumber');
    const trackRaw = form.get('track');
    const countryDialRaw = form.get('countryDial');
    const screenshot = form.get('screenshot');
    const portrait = form.get('portrait');

    if (typeof fullNameRaw !== 'string' || typeof churchRaw !== 'string') {
      return badRequest(VALIDATION_MESSAGES.nameRequired);
    }
    if (typeof nationalIdRaw !== 'string') {
      return badRequest(VALIDATION_MESSAGES.nationalIdRequired);
    }
    if (typeof emailRaw !== 'string') {
      return badRequest(VALIDATION_MESSAGES.emailRequired);
    }
    if (typeof eparchyRaw !== 'string') {
      return badRequest(VALIDATION_MESSAGES.eparchyRequired);
    }
    if (typeof confessionFatherRaw !== 'string') {
      return badRequest(VALIDATION_MESSAGES.confessionFatherRequired);
    }
    if (typeof confessionFatherChurchRaw !== 'string') {
      return badRequest(VALIDATION_MESSAGES.confessionFatherChurchRequired);
    }
    if (typeof currentServiceRaw !== 'string') {
      return badRequest(VALIDATION_MESSAGES.currentServiceRequired);
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
    const nationalId = sanitizeNationalIdInput(nationalIdRaw);
    const email = emailRaw.trim();
    const church = normalizeShortText(churchRaw);
    const eparchy = normalizeShortText(eparchyRaw);
    const confessionFather = normalizeShortText(confessionFatherRaw);
    const confessionFatherChurch = normalizeShortText(confessionFatherChurchRaw);
    const currentService = normalizeShortText(currentServiceRaw);

    if (!isValidName(fullName) || fullName.length > MAX_NAME_LENGTH) {
      return badRequest(VALIDATION_MESSAGES.nameTooShort);
    }
    if (!isValidEgyptianNationalId(nationalId)) {
      return badRequest(VALIDATION_MESSAGES.nationalIdInvalid);
    }
    if (!isValidEmail(email)) {
      return badRequest(VALIDATION_MESSAGES.emailInvalid);
    }
    if (!isValidShortText(church, 2, MAX_CHURCH_LENGTH)) {
      return badRequest(VALIDATION_MESSAGES.churchRequired);
    }
    if (!isValidShortText(eparchy, 2, MAX_CHURCH_LENGTH)) {
      return badRequest(VALIDATION_MESSAGES.eparchyRequired);
    }
    if (!isValidShortText(confessionFather, 2, MAX_CHURCH_LENGTH)) {
      return badRequest(VALIDATION_MESSAGES.confessionFatherRequired);
    }
    if (!isValidShortText(confessionFatherChurch, 2, MAX_CHURCH_LENGTH)) {
      return badRequest(VALIDATION_MESSAGES.confessionFatherChurchRequired);
    }
    if (!isValidShortText(currentService, 2, MAX_CHURCH_LENGTH)) {
      return badRequest(VALIDATION_MESSAGES.currentServiceRequired);
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

    const screenshotImage = await readStoredImage(screenshot, VALIDATION_MESSAGES.screenshotRequired);
    if (screenshotImage instanceof NextResponse) {
      return screenshotImage;
    }
    const portraitImage = await readStoredImage(portrait, VALIDATION_MESSAGES.portraitRequired);
    if (portraitImage instanceof NextResponse) {
      return portraitImage;
    }

    const registrantId = randomUUID();
    const paymentScreenshotUrl = receiptPointer(registrantId);
    const portraitUrl = portraitPointer(registrantId);
    const receiptFields = receiptWriteFields(screenshotImage.bytes, screenshotImage.mimeType);
    const portraitFields = portraitWriteFields(portraitImage.bytes, portraitImage.mimeType);
    const db = getAdminDb();

    try {
      await db.runTransaction(async (transaction) => {
        const phoneRef = db.collection('phoneIndex').doc(phoneNumber);
        const nationalIdRef = db.collection('nationalIdIndex').doc(nationalId);
        const phoneSnap = await transaction.get(phoneRef);
        const nationalIdSnap = await transaction.get(nationalIdRef);

        if (phoneSnap.exists) {
          throw new Error('DUPLICATE_PHONE');
        }
        if (nationalIdSnap.exists) {
          throw new Error('DUPLICATE_NATIONAL_ID');
        }

        transaction.set(db.collection(RECEIPTS_COLLECTION).doc(registrantId), receiptFields);
        transaction.set(db.collection(PORTRAITS_COLLECTION).doc(registrantId), portraitFields);

        transaction.set(db.collection('registrants').doc(registrantId), {
          fullName,
          nationalId,
          email,
          phoneNumber,
          whatsappNumber,
          church,
          eparchy,
          confessionFather,
          confessionFatherChurch,
          currentService,
          track: track.id,
          feeAmount: track.amount,
          feeCurrency: track.currency,
          countryDial: isAbroad ? countryDial : null,
          paymentScreenshotUrl,
          portraitUrl,
          status: 'pending_verification',
          adminNotes: null,
          createdAt: FieldValue.serverTimestamp(),
          verifiedAt: null,
        });

        transaction.set(phoneRef, { registrantId });
        transaction.set(nationalIdRef, { registrantId });
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
      if (txError instanceof Error && txError.message === 'DUPLICATE_NATIONAL_ID') {
        return NextResponse.json(
          {
            error: 'DUPLICATE_NATIONAL_ID',
            messageAr: VALIDATION_MESSAGES.duplicateNationalId,
          },
          { status: 409 }
        );
      }
      throw txError;
    }

    scheduleReviewQueueSync(db);
    invalidateAdminReadCache();

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
