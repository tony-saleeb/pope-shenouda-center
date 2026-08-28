export const EVENT_TIME_ZONE = 'Africa/Cairo';

export const EVENT_DAYS = [
  { id: '2026-08-27', labelAr: 'الخميس ٢٧ أغسطس', shortLabelAr: '٢٧ أغسطس' },
  { id: '2026-08-28', labelAr: 'الجمعة ٢٨ أغسطس', shortLabelAr: '٢٨ أغسطس' },
  { id: '2026-08-29', labelAr: 'السبت ٢٩ أغسطس', shortLabelAr: '٢٩ أغسطس' },
] as const;

export type EventDayId = (typeof EVENT_DAYS)[number]['id'];

export const EVENT_DAY_OTHER = 'other' as const;

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
    return key as EventDayId;
  }
  return EVENT_DAY_OTHER;
}

export function defaultEventDayId(now: Date = new Date()): EventDayId {
  const today = cairoDateKey(now);
  const match = EVENT_DAYS.find((day) => day.id === today);
  return match ? match.id : EVENT_DAYS[0].id;
}
