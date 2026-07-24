import { createHmac } from 'crypto';

const TICKET_SECRET = process.env.TICKET_SECRET || 'dev-secret-change-in-production';

/**
 * Sign a ticket ID using HMAC-SHA256 with an ultra-short 8-char signature.
 * Keeps payload minimal so QR code generates with giant, easily-scanned blocks (Version 1/2 QR).
 */
export function signTicket(ticketId: string): string {
  const shortSignature = createHmac('sha256', TICKET_SECRET)
    .update(ticketId)
    .digest('hex')
    .substring(0, 8);
  return `${ticketId}.${shortSignature}`;
}

/**
 * Verify a QR token string or URL and extract the ticket ID.
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

  // Check if cleaned is in signed format: ticketId.signature
  const parts = cleaned.split('.');
  if (parts.length === 2) {
    const [ticketId, providedSignature] = parts;
    const expectedSignature = createHmac('sha256', TICKET_SECRET)
      .update(ticketId)
      .digest('hex')
      .substring(0, providedSignature.length);

    if (providedSignature.length > 0 && providedSignature === expectedSignature) {
      return { valid: true, ticketId, isSigned: true };
    }
  }

  // Fallback: If it's a raw UUID / ID (or URL containing ID)
  const rawIdMatch = cleaned.match(/^[a-zA-Z0-9_-]+$/);
  if (rawIdMatch) {
    return { valid: true, ticketId: cleaned, isSigned: false };
  }

  return { valid: false, ticketId: null, isSigned: false };
}
