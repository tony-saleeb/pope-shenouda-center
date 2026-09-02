import { describe, it, expect } from 'vitest';
import {
  cairoDateKey,
  defaultEventDayId,
  eventDayIdForTimestamp,
  isCourseWeekday,
  listCourseSessions,
} from './eventDays';

describe('cairoDateKey', () => {
  it('uses Africa/Cairo, so late UTC on the 26th is still 27 August in Cairo', () => {
    expect(cairoDateKey('2026-08-26T21:00:00.000Z')).toBe('2026-08-27');
  });

  it('rolls to the next Cairo day after midnight', () => {
    expect(cairoDateKey('2026-08-27T21:00:00.000Z')).toBe('2026-08-28');
  });
});

describe('course weekdays', () => {
  it('keeps only Tuesday and Saturday', () => {
    expect(isCourseWeekday('2026-09-01')).toBe(true);
    expect(isCourseWeekday('2026-09-05')).toBe(true);
    expect(isCourseWeekday('2026-09-03')).toBe(false);
    expect(isCourseWeekday('2026-09-02')).toBe(false);
  });

  it('lists Tuesday and Saturday sessions from the course start', () => {
    const sessions = listCourseSessions('2026-09-01', '2026-09-12');
    expect(sessions.map((session) => session.id)).toEqual([
      '2026-09-01',
      '2026-09-05',
      '2026-09-08',
      '2026-09-12',
    ]);
    expect(sessions[0]?.weekdayAr).toBe('الثلاثاء');
    expect(sessions[1]?.weekdayAr).toBe('السبت');
  });
});

describe('eventDayIdForTimestamp', () => {
  it('maps scans onto Tuesday and Saturday sessions', () => {
    expect(eventDayIdForTimestamp('2026-10-03T10:00:00.000Z')).toBe('2026-10-03');
    expect(eventDayIdForTimestamp('2026-10-06T10:00:00.000Z')).toBe('2026-10-06');
  });

  it('sends timestamps outside the course schedule to other', () => {
    expect(eventDayIdForTimestamp('2026-08-26T10:00:00.000Z')).toBe('other');
    expect(eventDayIdForTimestamp('2026-09-01T10:00:00.000Z')).toBe('other');
    expect(eventDayIdForTimestamp(null)).toBe('other');
  });
});

describe('defaultEventDayId', () => {
  it('selects today when today is a session', () => {
    expect(defaultEventDayId(new Date('2026-10-06T12:00:00.000Z'))).toBe('2026-10-06');
  });

  it('falls forward to the next Tuesday or Saturday', () => {
    expect(defaultEventDayId(new Date('2026-10-01T12:00:00.000Z'))).toBe('2026-10-03');
  });

  it('falls back to the first session when before the course', () => {
    expect(defaultEventDayId(new Date('2026-08-01T12:00:00.000Z'))).toBe('2026-10-03');
  });
});
