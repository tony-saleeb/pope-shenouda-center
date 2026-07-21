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
 * Verify a QR token string and extract the ticket ID.
 * Returns the ticket ID if valid, null if tampered/invalid.
 */
export function verifyTicket(token: string): { valid: boolean; ticketId: string | null } {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, ticketId: null };
  }

  const [ticketId, providedSignature] = parts;

  const expectedSignature = createHmac('sha256', TICKET_SECRET)
    .update(ticketId)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (providedSignature.length !== expectedSignature.length) {
    return { valid: false, ticketId: null };
  }

  let mismatch = 0;
  for (let i = 0; i < providedSignature.length; i++) {
    mismatch |= providedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  if (mismatch !== 0) {
    return { valid: false, ticketId: null };
  }

  return { valid: true, ticketId };
}
