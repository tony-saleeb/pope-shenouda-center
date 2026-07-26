import { describe, it, expect, beforeAll } from 'vitest';
import { signTicket, verifyTicket } from './hmac';

beforeAll(() => {
  process.env.TICKET_SECRET = 'test-secret-for-hmac-tests';
});

describe('signTicket / verifyTicket', () => {
  it('round-trips a signed token and returns valid:true with correct ticketId', () => {
    const token = signTicket('TICKET-001');
    const result = verifyTicket(token);
    expect(result).toEqual({ valid: true, ticketId: 'TICKET-001', isSigned: true });
  });

  it('rejects a 1-char forgery (<id>.a)', () => {
    const result = verifyTicket('TICKET-001.a');
    expect(result.valid).toBe(false);
  });

  it('rejects an empty signature (<id>.)', () => {
    const result = verifyTicket('TICKET-001.');
    expect(result.valid).toBe(false);
  });

  it('rejects a raw ID with no signature', () => {
    const result = verifyTicket('TICKET-001');
    expect(result.valid).toBe(false);
  });

  it('rejects a truncated signature (15 correct chars)', () => {
    const token = signTicket('TICKET-002');
    const sig = token.split('.')[1];
    const truncated = `TICKET-002.${sig.substring(0, 15)}`;
    expect(verifyTicket(truncated).valid).toBe(false);
  });

  it('rejects 16 wrong hex chars', () => {
    const result = verifyTicket('TICKET-001.0000000000000000');
    // Could pass by freak coincidence, but astronomically unlikely
    expect(result.valid).toBe(false);
  });

  it('rejects a signature valid for ticket A used with ticket B', () => {
    const tokenA = signTicket('TICKET-AAA');
    const sigA = tokenA.split('.')[1];
    const swapped = `TICKET-BBB.${sigA}`;
    expect(verifyTicket(swapped).valid).toBe(false);
  });

  it('accepts a valid token wrapped in a URL', () => {
    const token = signTicket('TICKET-003');
    const url = `https://example.com/ticket/${token}`;
    const result = verifyTicket(url);
    expect(result).toEqual({ valid: true, ticketId: 'TICKET-003', isSigned: true });
  });

  it('does not throw on empty string', () => {
    expect(() => verifyTicket('')).not.toThrow();
    expect(verifyTicket('').valid).toBe(false);
  });

  it('does not throw on "…." (dots only)', () => {
    expect(() => verifyTicket('....')).not.toThrow();
    expect(verifyTicket('....').valid).toBe(false);
  });
});
