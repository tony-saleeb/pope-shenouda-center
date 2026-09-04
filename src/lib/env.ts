/**
 * Lazy, typed getters for server-only environment variables.
 * Validation is performed lazily inside each function when called,
 * preventing build crashes during Next.js static site generation.
 */

export function getTicketSecret(): string {
  const secret = process.env.TICKET_SECRET;
  if (!secret) {
    throw new Error('TICKET_SECRET is required');
  }
  return secret;
}

export function getUsherPasscode(): string {
  const passcode = process.env.USHER_PASSCODE;
  if (!passcode) {
    throw new Error('USHER_PASSCODE is required');
  }
  return passcode;
}
