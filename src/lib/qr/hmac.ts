import { createHmac } from 'crypto';

const TICKET_SECRET = process.env.TICKET_SECRET || 'dev-secret-change-in-production';

/**
 * Sign a ticket ID using HMAC-SHA256.
 * Returns a combined token: `ticketId.signature`
 * This token is what gets encoded in the QR code.
 */
export function signTicket(ticketId: string): string {
  const signature = createHmac('sha256', TICKET_SECRET)
    .update(ticketId)
    .digest('hex');
  return `${ticketId}.${signature}`;
}

/**
 * Verify a QR token string or URL and extract the ticket ID.
 * Flexible: Handles full signed tokens, raw ticket IDs, or ticket URLs.
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
      .digest('hex');

    if (providedSignature.length === expectedSignature.length) {
      let mismatch = 0;
      for (let i = 0; i < providedSignature.length; i++) {
        mismatch |= providedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
      }
      if (mismatch === 0) {
        return { valid: true, ticketId, isSigned: true };
      }
    }
  }

  // Fallback: If it's a raw UUID / ID (or URL containing ID)
  // Extract alphanumeric + hyphen string
  const rawIdMatch = cleaned.match(/^[a-zA-Z0-9_-]+$/);
  if (rawIdMatch) {
    return { valid: true, ticketId: cleaned, isSigned: false };
  }

  return { valid: false, ticketId: null, isSigned: false };
}
