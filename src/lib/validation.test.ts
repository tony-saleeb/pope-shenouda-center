import { describe, it, expect } from 'vitest';
import {
  safeImageSrc,
  isValidEgyptianPhone,
  isValidEgyptianNationalId,
  isValidEmail,
  isValidInternationalPhone,
  isValidShortText,
  normalizePhone,
  resolveLookupPhoneId,
  sanitizeNationalIdInput,
  sanitizePhoneInput,
  toPhoneIndexId,
  isValidName,
  matchesAdminSearch,
} from './validation';

describe('safeImageSrc', () => {
  it('allows valid base64 data URIs for jpeg, png, and webp', () => {
    const validJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAADAAAA';
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const validWebp = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

    expect(safeImageSrc(validJpeg)).toBe(validJpeg);
    expect(safeImageSrc(validPng)).toBe(validPng);
    expect(safeImageSrc(validWebp)).toBe(validWebp);
  });

  it('allows HTTPS Firebase Storage URLs', () => {
    const firebaseStorageUrl = 'https://firebasestorage.googleapis.com/v0/b/project.appspot.com/o/image.png?alt=media';
    expect(safeImageSrc(firebaseStorageUrl)).toBe(firebaseStorageUrl);
  });

  it('rejects malicious javascript: URLs', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('javascript:void(0)')).toBeNull();
  });

  it('allows same-origin blob object URLs', () => {
    const blobUrl = 'blob:https://example.com/11111111-2222-3333-4444-555555555555';
    expect(safeImageSrc(blobUrl)).toBe(blobUrl);
  });

  it('rejects unauthorized external HTTP/HTTPS domains', () => {
    expect(safeImageSrc('https://evil.com/malicious.png')).toBeNull();
    expect(safeImageSrc('http://untrusted-site.org/image.jpg')).toBeNull();
  });

  it('rejects non-string inputs and null/undefined', () => {
    expect(safeImageSrc(null)).toBeNull();
    expect(safeImageSrc(undefined)).toBeNull();
    expect(safeImageSrc(12345)).toBeNull();
    expect(safeImageSrc('')).toBeNull();
  });
});

describe('isValidEgyptianPhone & normalizePhone', () => {
  it('validates 11-digit Egyptian phone numbers starting with 010, 011, 012, 015', () => {
    expect(isValidEgyptianPhone('01012345678')).toBe(true);
    expect(isValidEgyptianPhone('01112345678')).toBe(true);
    expect(isValidEgyptianPhone('01212345678')).toBe(true);
    expect(isValidEgyptianPhone('01512345678')).toBe(true);

    expect(isValidEgyptianPhone('01312345678')).toBe(false);
    expect(isValidEgyptianPhone('0101234567')).toBe(false);
    expect(isValidEgyptianPhone('abc')).toBe(false);
  });

  it('normalizes spaces and hyphens', () => {
    expect(normalizePhone('010 1234-5678')).toBe('01012345678');
  });

  it('accepts Eastern Arabic and Persian digits', () => {
    expect(normalizePhone('٠١٢١٢٣٤٥٦٧٨')).toBe('01212345678');
    expect(isValidEgyptianPhone('٠١٢١٢٣٤٥٦٧٨')).toBe(true);
    expect(sanitizePhoneInput('٠١٢٧١٤٨٨١٣abc')).toBe('0127148813');
    expect(sanitizePhoneInput('۰۱۲۱۲۳۴۵۶۷۸')).toBe('01212345678');
  });

  it('validates international numbers with a country dial code', () => {
    expect(isValidInternationalPhone('1', '2025551234')).toBe(true);
    expect(isValidInternationalPhone('971', '501234567')).toBe(true);
    expect(toPhoneIndexId('44', '07123456789')).toBe('447123456789');
    expect(isValidInternationalPhone('1', '12')).toBe(false);
    expect(resolveLookupPhoneId('+1 2025551234')).toBe('12025551234');
    expect(resolveLookupPhoneId('01012345678')).toBe('01012345678');
  });
});

describe('isValidName', () => {
  it('requires at least 3 words of 2+ characters each', () => {
    expect(isValidName('مينا مجدي جرجس')).toBe(true);
    expect(isValidName('مارينا ملاك عازر صبحي')).toBe(true);

    expect(isValidName('مينا')).toBe(false);
    expect(isValidName('مينا مجدي')).toBe(false);
    expect(isValidName('أ ب ج')).toBe(false);
    expect(isValidName('')).toBe(false);
  });
});

describe('isValidEgyptianNationalId', () => {
  it('accepts a 14-digit ID with century 2 or 3 and a real birth date', () => {
    expect(isValidEgyptianNationalId('29501011234567')).toBe(true);
    expect(isValidEgyptianNationalId('30501011234567')).toBe(true);
    expect(isValidEgyptianNationalId('٢٩٥٠١٠١١٢٣٤٥٦٧')).toBe(true);
    expect(sanitizeNationalIdInput('29501011234567extra')).toBe('29501011234567');
  });

  it('rejects wrong length, century, or impossible dates', () => {
    expect(isValidEgyptianNationalId('19501011234567')).toBe(false);
    expect(isValidEgyptianNationalId('29513011234567')).toBe(false);
    expect(isValidEgyptianNationalId('29702291234567')).toBe(false);
    expect(isValidEgyptianNationalId('2950101')).toBe(false);
  });
});

describe('isValidEmail & isValidShortText', () => {
  it('accepts a normal email and rejects empty or malformed values', () => {
    expect(isValidEmail('name@example.com')).toBe(true);
    expect(isValidEmail('  name@example.com  ')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('requires a trimmed church-style text field of 2–120 characters', () => {
    expect(isValidShortText('إيبارشية شبرا')).toBe(true);
    expect(isValidShortText('أ')).toBe(false);
    expect(isValidShortText('   ')).toBe(false);
  });
});

describe('matchesAdminSearch', () => {
  it('matches first and last name even when a middle name is skipped', () => {
    expect(matchesAdminSearch(['ميلاد عوض مرقص معوض'], 'ميلاد مرقص')).toBe(true);
    expect(matchesAdminSearch(['ميلاد عوض مرقص معوض'], 'ميلاد عوض مرقص معوض')).toBe(true);
  });

  it('treats Arabic letter variants as the same', () => {
    expect(matchesAdminSearch(['الانبا رويس'], 'الأنبا')).toBe(true);
    expect(matchesAdminSearch(['كنسية ماري جرجس'], 'مارى')).toBe(true);
  });

  it('ignores extra spaces and does not require a consecutive full-string match', () => {
    expect(matchesAdminSearch(['مينا  مجدي   جرجس'], 'مينا مجدي')).toBe(true);
  });

  it('rejects a query whose tokens are not all present', () => {
    expect(matchesAdminSearch(['مينا مجدي جرجس'], 'مينا ميخائيل')).toBe(false);
  });
});
