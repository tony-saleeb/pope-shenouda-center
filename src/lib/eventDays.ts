export const EVENT_TIME_ZONE = 'Africa/Cairo';

/** Tuesday and Saturday in JS weekday numbers (Sun = 0). */
export const COURSE_WEEKDAYS = [2, 6] as const;

export const COURSE_START = '2026-10-01';
export const COURSE_END = '2026-12-31';

export const EVENT_DAY_OTHER = 'other' as const;

export interface CourseSession {
  id: string;
  weekday: 2 | 6 | number;
  weekdayAr: string;
  labelAr: string;
  shortLabelAr: string;
  dayAr: string;
  monthKey: string;
  monthLabelAr: string;
}

const WEEKDAY_AR: Record<number, string> = {
  0: 'الأحد',
  1: 'الاثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function civilDateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 10, 0, 0));
}

function nextCivilKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

export function cairoWeekday(key: string): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
  }).format(civilDateFromKey(key));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? -1;
}

export function isCourseWeekday(key: string): boolean {
  const weekday = cairoWeekday(key);
  return weekday === 2 || weekday === 6;
}

export function describeSession(key: string): CourseSession {
  const date = civilDateFromKey(key);
  const weekday = cairoWeekday(key);
  const weekdayAr = WEEKDAY_AR[weekday] ?? '';
  const dayMonth = new Intl.DateTimeFormat('ar-EG', {
    timeZone: EVENT_TIME_ZONE,
    day: 'numeric',
    month: 'short',
  }).format(date);
  const monthLabelAr = new Intl.DateTimeFormat('ar-EG', {
    timeZone: EVENT_TIME_ZONE,
    month: 'long',
    year: 'numeric',
  }).format(date);
  const dayAr = new Intl.DateTimeFormat('ar-EG', {
    timeZone: EVENT_TIME_ZONE,
    day: 'numeric',
  }).format(date);

  return {
    id: key,
    weekday,
    weekdayAr,
    labelAr: `${weekdayAr} ${dayMonth}`,
    shortLabelAr: dayMonth,
    dayAr,
    monthKey: key.slice(0, 7),
    monthLabelAr,
  };
}

export function listCourseSessions(
  startKey: string = COURSE_START,
  endKey: string = COURSE_END
): CourseSession[] {
  const sessions: CourseSession[] = [];
  let cursor = startKey;
  while (cursor <= endKey) {
    if (isCourseWeekday(cursor)) {
      sessions.push(describeSession(cursor));
    }
    cursor = nextCivilKey(cursor);
  }
  return sessions;
}

export const EVENT_DAYS = listCourseSessions();

export type EventDayId = string;
export type GateDayId = EventDayId | typeof EVENT_DAY_OTHER | 'all';

/** Calendar date in Cairo, `YYYY-MM-DD`. */
export function cairoDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function eventDayIdForTimestamp(iso: string | null | undefined): typeof EVENT_DAY_OTHER | EventDayId {
  const key = cairoDateKey(iso);
  if (key && EVENT_DAYS.some((day) => day.id === key)) {
    return key;
  }
  return EVENT_DAY_OTHER;
}

export function defaultEventDayId(now: Date = new Date()): EventDayId {
  const today = cairoDateKey(now);
  if (today) {
    const match = EVENT_DAYS.find((day) => day.id === today);
    if (match) return match.id;
    const upcoming = EVENT_DAYS.find((day) => day.id > today);
    if (upcoming) return upcoming.id;
  }
  return EVENT_DAYS[0]?.id ?? COURSE_START;
}

export function mergeSessionDays(extraKeys: string[]): CourseSession[] {
  const have = new Set(EVENT_DAYS.map((day) => day.id));
  const extra = extraKeys
    .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key) && !have.has(key))
    .sort();
  if (extra.length === 0) return EVENT_DAYS;
  return [...EVENT_DAYS, ...extra.map(describeSession)].sort((a, b) => a.id.localeCompare(b.id));
}
