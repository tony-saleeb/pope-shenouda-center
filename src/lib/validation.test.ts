import { describe, it, expect } from 'vitest';
import { safeImageSrc, isValidEgyptianPhone, normalizePhone } from './validation';

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
});
