import { describe, it, expect } from 'vitest';
import { expandTicketCheckIns, hasCheckInOnDay } from './gateCheckIns';

describe('hasCheckInOnDay', () => {
  it('blocks a second scan on the same Cairo day using the legacy usedAt field', () => {
    expect(
      hasCheckInOnDay({ usedAt: '2026-08-28T12:00:00.000Z' }, '2026-08-28')
    ).toBe(true);
  });

  it('allows a scan on a later conference day', () => {
    expect(
      hasCheckInOnDay({ usedAt: '2026-08-28T12:00:00.000Z' }, '2026-08-29')
    ).toBe(false);
  });

  it('blocks today when checkIns already has that day key', () => {
    expect(
      hasCheckInOnDay(
        {
          usedAt: '2026-08-29T10:00:00.000Z',
          checkIns: {
            '2026-08-28': { usedAt: '2026-08-28T12:00:00.000Z', usedByUsherId: 'usher' },
            '2026-08-29': { usedAt: '2026-08-29T10:00:00.000Z', usedByUsherId: 'usher' },
          },
        },
        '2026-08-29'
      )
    ).toBe(true);
  });
});

describe('expandTicketCheckIns', () => {
  it('keeps both days when checkIns has history and usedAt is the latest scan', () => {
    const rows = expandTicketCheckIns({
      usedAt: '2026-08-29T10:00:00.000Z',
      usedByUsherId: 'today',
      checkIns: {
        '2026-08-28': { usedAt: '2026-08-28T12:00:00.000Z', usedByUsherId: 'yesterday' },
        '2026-08-29': { usedAt: '2026-08-29T10:00:00.000Z', usedByUsherId: 'today' },
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.usedByUsherId).sort()).toEqual(['today', 'yesterday']);
  });

  it('falls back to usedAt for tickets scanned before checkIns existed', () => {
    const rows = expandTicketCheckIns({
      usedAt: '2026-08-28T12:00:00.000Z',
      usedByUsherId: 'usher',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].usedAt).toBe('2026-08-28T12:00:00.000Z');
  });
});
