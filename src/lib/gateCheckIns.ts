import { cairoDateKey } from '@/lib/eventDays';

type TimestampLike = { toDate?: () => Date };

export function toIsoTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'object' && typeof (value as TimestampLike).toDate === 'function') {
    const date = (value as TimestampLike).toDate!();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

export interface GateCheckInRow {
  usedAt: string | null;
  usedByUsherId: string;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** True when this ticket already has a check-in on the given Cairo calendar day. */
export function hasCheckInOnDay(
  data: { checkIns?: unknown; usedAt?: unknown },
  dayKey: string
): boolean {
  const checkIns = data.checkIns;
  if (checkIns && typeof checkIns === 'object' && !Array.isArray(checkIns)) {
    if (Object.prototype.hasOwnProperty.call(checkIns, dayKey)) {
      return true;
    }
  }
  return cairoDateKey(toIsoTimestamp(data.usedAt)) === dayKey;
}

/**
 * One attendance row per Cairo day.
 * Keeps yesterday's entry when a later scan overwrites the top-level usedAt.
 */
export function expandTicketCheckIns(data: {
  checkIns?: unknown;
  usedAt?: unknown;
  usedByUsherId?: unknown;
}): GateCheckInRow[] {
  const byDay = new Map<string, GateCheckInRow>();

  const checkIns = data.checkIns;
  if (checkIns && typeof checkIns === 'object' && !Array.isArray(checkIns)) {
    for (const entry of Object.values(checkIns as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as { usedAt?: unknown; usedByUsherId?: unknown };
      const iso = toIsoTimestamp(rec.usedAt);
      const day = cairoDateKey(iso);
      if (!day) continue;
      byDay.set(day, {
        usedAt: iso,
        usedByUsherId: asString(rec.usedByUsherId),
      });
    }
  }

  const legacyIso = toIsoTimestamp(data.usedAt);
  const legacyDay = cairoDateKey(legacyIso);
  if (legacyDay && !byDay.has(legacyDay)) {
    byDay.set(legacyDay, {
      usedAt: legacyIso,
      usedByUsherId: asString(data.usedByUsherId),
    });
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([, row]) => row);
}
