/**
 * Egyptian phone number validation and form field helpers.
 */

/** Validate an Egyptian mobile phone number: 01[0125]XXXXXXXX (11 digits) */
export function isValidEgyptianPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  return /^01[0125]\d{8}$/.test(cleaned);
}

/** Clean and normalize an Egyptian phone number */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '');
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

  // Allow HTTPS Firebase Storage URLs
  if (/^https:\/\/firebasestorage\.googleapis\.com\//.test(trimmed)) {
    return trimmed;
  }

  return null;
}
