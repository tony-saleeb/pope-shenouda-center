import { describe, it, expect } from 'vitest';
import {
  cairoDateKey,
  defaultEventDayId,
  eventDayIdForTimestamp,
  EVENT_DAYS,
} from './eventDays';

describe('cairoDateKey', () => {
  it('uses Africa/Cairo, so late UTC on the 26th is still 27 August in Cairo', () => {
    expect(cairoDateKey('2026-08-26T21:00:00.000Z')).toBe('2026-08-27');
  });

  it('rolls to the next Cairo day after midnight', () => {
    expect(cairoDateKey('2026-08-27T21:00:00.000Z')).toBe('2026-08-28');
  });
});

describe('eventDayIdForTimestamp', () => {
  it('maps scans onto the three conference days', () => {
    expect(eventDayIdForTimestamp('2026-08-27T10:00:00.000Z')).toBe('2026-08-27');
    expect(eventDayIdForTimestamp('2026-08-28T10:00:00.000Z')).toBe('2026-08-28');
    expect(eventDayIdForTimestamp('2026-08-29T10:00:00.000Z')).toBe('2026-08-29');
  });

  it('sends timestamps outside the conference to other', () => {
    expect(eventDayIdForTimestamp('2026-08-26T10:00:00.000Z')).toBe('other');
    expect(eventDayIdForTimestamp(null)).toBe('other');
  });
});

describe('defaultEventDayId', () => {
  it('selects today when today is a conference day', () => {
    expect(defaultEventDayId(new Date('2026-08-28T12:00:00.000Z'))).toBe('2026-08-28');
  });

  it('falls back to the first conference day otherwise', () => {
    expect(defaultEventDayId(new Date('2026-08-01T12:00:00.000Z'))).toBe(EVENT_DAYS[0].id);
  });
});
