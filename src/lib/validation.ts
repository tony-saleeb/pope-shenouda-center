/**
 * Egyptian phone number validation and form field helpers.
 */

/** Clean and normalize an Egyptian phone number, converting Eastern Arabic digits to Western digits */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const converted = phone
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
  return converted.replace(/[\s\-\(\)]/g, '');
}

/** Convert Arabic or English digits to Western 0-9. */
export function digitsOnlyPhone(value: string): string {
  return normalizePhone(value).replace(/\D/g, '');
}

/** Convert Arabic or English digits to Western 0-9 and keep at most `maxDigits` phone digits. */
export function sanitizePhoneInput(value: string, maxDigits = 11): string {
  return digitsOnlyPhone(value).slice(0, maxDigits);
}

/** National number for an international line: drop a leading 0, cap length. */
export function sanitizeNationalPhoneInput(value: string): string {
  let digits = digitsOnlyPhone(value);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 12);
}

/** Validate an Egyptian mobile phone number: 01[0125]XXXXXXXX (11 digits) */
export function isValidEgyptianPhone(phone: string): boolean {
  const cleaned = normalizePhone(phone);
  return /^01[0125]\d{8}$/.test(cleaned);
}

/** International number: country dial + national digits, 8–15 digits total. */
export function isValidInternationalPhone(dial: string, national: string): boolean {
  if (!/^\d{1,4}$/.test(dial)) return false;
  const local = sanitizeNationalPhoneInput(national);
  if (!/^\d{6,12}$/.test(local)) return false;
  const combined = `${dial}${local}`;
  return combined.length >= 8 && combined.length <= 15;
}

export function toPhoneIndexId(dial: string, national: string): string {
  return `${dial}${sanitizeNationalPhoneInput(national)}`;
}

/**
 * Phone index document id for lookup: Egyptian 01… or an international number of 8–15 digits.
 */
export function resolveLookupPhoneId(raw: string): string | null {
  const egyptian = normalizePhone(raw);
  if (isValidEgyptianPhone(egyptian)) return egyptian;

  let digits = digitsOnlyPhone(raw);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('20') && digits.length === 12) {
    const local = `0${digits.slice(2)}`;
    if (isValidEgyptianPhone(local)) return local;
  }
  if (digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0')) {
    return digits;
  }
  return null;
}

/** Validate that a name contains at least 3 words (الاسم ثلاثي على الأقل) */
export function isValidName(name: string): boolean {
  if (typeof name !== 'string') return false;
  const words = name.trim().split(/\s+/).filter((w) => w.length > 0);
  return words.length >= 3 && words.every((w) => w.length >= 2);
}

/** Check if an amount is within tolerance of the expected amount */
export function isAmountWithinTolerance(
  actual: number,
  expected: number,
  tolerance: number = 5
): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/** Validation error messages in Arabic */
export const VALIDATION_MESSAGES = {
  nameRequired: 'برجاء إدخال الاسم ثلاثي على الأقل',
  nameTooShort: 'يرجى إدخال الاسم ثلاثي على الأقل (مثال: مينا مجدي جرجس)',
  churchRequired: 'برجاء اختيار الكنيسة',
  customChurchRequired: 'برجاء إدخال اسم الكنيسة',
  phoneRequired: 'برجاء إدخال رقم الموبايل',
  phoneInvalid: 'رقم الموبايل غير صحيح، تأكد من كتابة ١١ رقم يبدأ بـ 01',
  intlPhoneInvalid: 'رقم الموبايل غير صحيح، تأكد من كود الدولة والرقم',
  countryRequired: 'برجاء اختيار كود الدولة',
  trackRequired: 'برجاء اختيار نوع التسجيل',
  whatsappRequired: 'برجاء إدخال رقم الواتساب',
  whatsappInvalid: 'رقم الواتساب غير صحيح، تأكد من كتابة ١١ رقم يبدأ بـ 01',
  screenshotRequired: 'برجاء إرفاق صورة إيصال الدفع',
  duplicatePhone: 'هذا الرقم مسجّل بالفعل',
  uploadFailed: 'فشل رفع الصورة، برجاء المحاولة مرة أخرى',
  genericError: 'حدث خطأ، برجاء المحاولة مرة أخرى',
} as const;

/** Format a phone number for display (adds spaces) */
export function formatPhoneDisplay(phone: string): string {
  const cleaned = normalizePhone(phone);
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 7)} ${cleaned.slice(7)}`;
  }
  return cleaned;
}

/**
 * Safely validate an image URL or data URI.
 * Accepts ONLY base64 image data URIs (jpeg/png/webp) or Firebase Storage URLs.
 * Prevents XSS via javascript: or malicious data: schemes in anchor href or img src attributes.
 */
export function safeImageSrc(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  const trimmed = url.trim();

  // Allow base64 data URIs for jpeg, png, or webp images
  const base64Pattern = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  if (base64Pattern.test(trimmed)) {
    return trimmed;
  }

  if (/^https:\/\/firebasestorage\.googleapis\.com\//.test(trimmed)) {
    return trimmed;
  }

  if (/^https:\/\/storage\.googleapis\.com\//.test(trimmed)) {
    return trimmed;
  }

  if (/^https:\/\/storage\.cloud\.google\.com\//.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Normalize Arabic/English text for admin search: alef variants, yaa/alef maqsura,
 * taa marbuta, tashkeel, Eastern digits, and extra whitespace.
 */
export function normalizeForSearch(value: string): string {
  if (!value) return '';
  return value
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .toLowerCase()
    .replace(/[\s\-_.,،()]+/g, ' ')
    .trim();
}

/** True when every query word appears somewhere in the given fields (any order). */
export function matchesAdminSearch(
  fields: Array<string | null | undefined>,
  rawQuery: string
): boolean {
  const tokens = normalizeForSearch(rawQuery).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalizeForSearch(fields.filter((f): f is string => Boolean(f)).join(' '));
  return tokens.every((token) => haystack.includes(token));
}
