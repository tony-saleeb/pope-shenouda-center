import { createHmac, timingSafeEqual } from 'crypto';
import { getTicketSecret } from '@/lib/env';

/** Signature length in hex characters (64 bits). */
const SIG_LEN = 16;

/**
 * Sign a ticket ID using HMAC-SHA256, truncated to SIG_LEN hex chars.
 * Keeps payload minimal so QR code generates with easily-scanned blocks.
 */
export function signTicket(ticketId: string): string {
  const shortSignature = createHmac('sha256', getTicketSecret())
    .update(ticketId)
    .digest('hex')
    .substring(0, SIG_LEN);
  return `${ticketId}.${shortSignature}`;
}

/**
 * Verify a QR token string or URL and extract the ticket ID.
 *
 * Only signed tokens are accepted — unsigned / raw IDs are rejected.
 * Comparison uses timingSafeEqual to prevent timing side-channels.
 */
export function verifyTicket(input: string): { valid: boolean; ticketId: string | null; isSigned: boolean } {
  let cleaned = input.trim();

  // If input is a URL like https://.../ticket/XYZ or https://.../ticket/XYZ.sig
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    try {
      const url = new URL(cleaned);
      const parts = url.pathname.split('/').filter(Boolean);
      const ticketIndex = parts.indexOf('ticket');
      if (ticketIndex !== -1 && parts[ticketIndex + 1]) {
        cleaned = decodeURIComponent(parts[ticketIndex + 1]);
      } else if (parts.length > 0) {
        cleaned = decodeURIComponent(parts[parts.length - 1]);
      }
    } catch {
      // Ignore URL parse error
    }
  }

  // Require signed format: ticketId.signature
  const dotIndex = cleaned.lastIndexOf('.');
  if (dotIndex === -1) {
    return { valid: false, ticketId: null, isSigned: false };
  }

  const ticketId = cleaned.substring(0, dotIndex);
  const providedSignature = cleaned.substring(dotIndex + 1);

  // Reject unless the provided signature is exactly SIG_LEN hex chars
  if (providedSignature.length !== SIG_LEN) {
    return { valid: false, ticketId: null, isSigned: false };
  }

  const expectedSignature = createHmac('sha256', getTicketSecret())
    .update(ticketId)
    .digest('hex')
    .substring(0, SIG_LEN);

  // Constant-time comparison on equal-length buffers
  const a = Buffer.from(providedSignature, 'utf8');
  const b = Buffer.from(expectedSignature, 'utf8');

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, ticketId: null, isSigned: false };
  }

  return { valid: true, ticketId, isSigned: true };
}
