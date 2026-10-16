import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import jsQR from 'jsqr';

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromDate: (date: Date) => {
      const copy = new Date(date.getTime());
      return { toDate: () => new Date(copy.getTime()) };
    },
  },
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  getLimiter: vi.fn(() => ({})),
  limitByIp: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireUsher: vi.fn().mockResolvedValue({ authorized: true, uid: 'usher-1', role: 'usher' }),
  requireAdmin: vi.fn().mockResolvedValue({ authorized: true, uid: 'admin-1', role: 'admin' }),
}));

import { POST } from './route';
import { GET as getRoster } from '@/app/api/admin/scanned/route';
import { getAdminDb } from '@/lib/firebase/admin';
import { invalidateAdminReadCache } from '@/lib/adminReadCache';
import { generateQrCodeDataUrl } from '@/lib/qr/generator';
import { signTicket } from '@/lib/qr/hmac';
import { EVENT_TIME_ZONE } from '@/lib/eventDays';

type Doc = Record<string, unknown>;
type Store = Record<string, Map<string, Doc>>;

function applyUpdate(target: Doc, updates: Record<string, unknown>) {
  for (const [key, value] of Object.entries(updates)) {
    const parts = key.split('.');
    let node: Doc = target;
    for (const part of parts.slice(0, -1)) {
      if (!node[part] || typeof node[part] !== 'object') node[part] = {};
      node = node[part] as Doc;
    }
    node[parts[parts.length - 1]] = value;
  }
}

function fakeDb(store: Store) {
  const snap = (name: string, id: string) => {
    const data = store[name]?.get(id);
    return { id, exists: Boolean(data), data: () => data };
  };

  const query = (name: string, filters: Array<(doc: Doc) => boolean>) => ({
    where(field: string, op: string, value: unknown) {
      const test =
        op === 'in'
          ? (doc: Doc) => (value as unknown[]).includes(doc[field])
          : (doc: Doc) => doc[field] === value;
      return query(name, [...filters, test]);
    },
    select() {
      return query(name, filters);
    },
    limit() {
      return query(name, filters);
    },
    async get() {
      const docs = [...(store[name] ?? new Map()).entries()]
        .filter(([, doc]) => filters.every((test) => test(doc)))
        .map(([id]) => snap(name, id));
      return { empty: docs.length === 0, docs };
    },
  });

  return {
    collection(name: string) {
      return {
        ...query(name, []),
        doc(id: string) {
          return { name, id, get: async () => snap(name, id) };
        },
      };
    },
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>) {
      const tx = {
        get: async (ref: { name: string; id: string }) => snap(ref.name, ref.id),
        update: (ref: { name: string; id: string }, updates: Record<string, unknown>) => {
          const doc = store[ref.name].get(ref.id);
          if (!doc) throw new Error('missing doc');
          applyUpdate(doc, updates);
        },
      };
      return fn(tx);
    },
  };
}

function scanRequest(qrToken: string) {
  return new NextRequest('http://localhost/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrToken }),
  });
}

async function scanAt(isoUtc: string, qrToken: string) {
  vi.setSystemTime(new Date(isoUtc));
  const res = await POST(scanRequest(qrToken));
  return { status: res.status, body: await res.json() };
}

async function decodeQrDataUrl(dataUrl: string): Promise<string | null> {
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

function cairoClock(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: EVENT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

const REG_ID = 'reg-onsite-1';

let store: Store;

function seed(overrides: Doc = {}) {
  store = {
    registrants: new Map([
      [
        REG_ID,
        {
          fullName: 'مايكل رمزى عزيز تاوضروس',
          church: 'كنيسة',
          phoneNumber: '01000000000',
          track: 'onsite_exam_onsite',
          status: 'approved',
          ...overrides,
        },
      ],
    ]),
    tickets: new Map([[REG_ID, { qrToken: signTicket(REG_ID), used: false, usedAt: null, usedByUsherId: null }]]),
  };
  (getAdminDb as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(fakeDb(store));
}

function ticket() {
  return store.tickets.get(REG_ID) as {
    usedAt: { toDate: () => Date } | null;
    checkIns?: Record<string, { usedAt: { toDate: () => Date }; usedByUsherId: string }>;
  };
}

describe('attendance QR to gate check-in', () => {
  beforeAll(() => {
    process.env.TICKET_SECRET = 'test-ticket-secret';
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    invalidateAdminReadCache();
    seed();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('the generated QR image decodes to a token the gate accepts', async () => {
    const decoded = await decodeQrDataUrl(await generateQrCodeDataUrl(REG_ID));
    expect(decoded).toBe(signTicket(REG_ID));

    const { status, body } = await scanAt('2026-10-06T07:15:42.250Z', decoded!);
    expect(status).toBe(200);
    expect(body.type).toBe('success');
    expect(body.registrantId).toBe(REG_ID);
  });

  it('stores the exact scan instant under the Cairo session day', async () => {
    await scanAt('2026-10-06T07:15:42.250Z', signTicket(REG_ID));

    const saved = ticket();
    expect(Object.keys(saved.checkIns ?? {})).toEqual(['2026-10-06']);
    expect(saved.checkIns!['2026-10-06'].usedAt.toDate().toISOString()).toBe('2026-10-06T07:15:42.250Z');
    expect(saved.checkIns!['2026-10-06'].usedByUsherId).toBe('usher-1');
    expect(saved.usedAt!.toDate().toISOString()).toBe('2026-10-06T07:15:42.250Z');
    expect(cairoClock('2026-10-06T07:15:42.250Z')).toBe('10:15:42');
  });

  it('refuses a second scan the same day and reports the first time', async () => {
    await scanAt('2026-10-06T07:15:00.000Z', signTicket(REG_ID));
    const second = await scanAt('2026-10-06T15:00:00.000Z', signTicket(REG_ID));

    expect(second.body.type).toBe('already_used');
    expect(second.body.usedAt).toBe('2026-10-06T07:15:00.000Z');
    expect(ticket().checkIns!['2026-10-06'].usedAt.toDate().toISOString()).toBe('2026-10-06T07:15:00.000Z');
  });

  it('keeps earlier sessions when the person attends the next one', async () => {
    await scanAt('2026-10-06T07:15:00.000Z', signTicket(REG_ID));
    const saturday = await scanAt('2026-10-10T08:05:00.000Z', signTicket(REG_ID));

    expect(saturday.body.type).toBe('success');
    const checkIns = ticket().checkIns!;
    expect(Object.keys(checkIns).sort()).toEqual(['2026-10-06', '2026-10-10']);
    expect(checkIns['2026-10-06'].usedAt.toDate().toISOString()).toBe('2026-10-06T07:15:00.000Z');
    expect(checkIns['2026-10-10'].usedAt.toDate().toISOString()).toBe('2026-10-10T08:05:00.000Z');
  });

  it('splits days at Cairo midnight, not UTC midnight', async () => {
    const late = await scanAt('2026-10-06T20:59:59.999Z', signTicket(REG_ID));
    const afterMidnight = await scanAt('2026-10-06T21:00:00.000Z', signTicket(REG_ID));

    expect(late.body.type).toBe('success');
    expect(afterMidnight.body.type).toBe('success');
    const checkIns = ticket().checkIns!;
    expect(checkIns['2026-10-06'].usedAt.toDate().toISOString()).toBe('2026-10-06T20:59:59.999Z');
    expect(checkIns['2026-10-07'].usedAt.toDate().toISOString()).toBe('2026-10-06T21:00:00.000Z');
  });

  it('uses winter time after the October clock change', async () => {
    await scanAt('2026-11-03T07:00:00.000Z', signTicket(REG_ID));
    expect(Object.keys(ticket().checkIns ?? {})).toEqual(['2026-11-03']);
    expect(cairoClock('2026-11-03T07:00:00.000Z')).toBe('09:00:00');
  });

  it('shows the scan on the hall roster with the same day and time', async () => {
    await scanAt('2026-10-06T07:15:42.250Z', signTicket(REG_ID));
    await scanAt('2026-10-10T08:05:00.000Z', signTicket(REG_ID));

    const res = await getRoster(new NextRequest('http://localhost/api/admin/scanned'));
    const payload = await res.json();
    const student = payload.students.find((row: { id: string }) => row.id === REG_ID);

    expect(student.attended).toEqual({
      '2026-10-06': '2026-10-06T07:15:42.250Z',
      '2026-10-10': '2026-10-10T08:05:00.000Z',
    });
    expect(student.attendedCount).toBe(2);
  });

  it('rejects a tampered signature without writing', async () => {
    const forged = `${REG_ID}.0000000000000000`;
    const { status, body } = await scanAt('2026-10-06T07:15:00.000Z', forged);
    expect(status).toBe(400);
    expect(body.type).toBe('tampered');
    expect(ticket().checkIns).toBeUndefined();
  });

  it.each(['pending_verification', 'rejected'])('refuses a %s registration without writing', async (status) => {
    seed({ status });
    const result = await scanAt('2026-10-06T07:15:00.000Z', signTicket(REG_ID));
    expect(result.status).toBe(403);
    expect(result.body.messageAr).toBe('هذا التسجيل غير مقبول — لا يمكن تسجيل الحضور');
    expect(ticket().checkIns).toBeUndefined();
  });

  it.each(['online_exam_onsite', 'online_no_exam'])('checks in %s', async (track) => {
    seed({ track });
    const result = await scanAt('2026-10-06T07:15:00.000Z', signTicket(REG_ID));
    expect(result.status).toBe(200);
    expect(result.body.type).toBe('success');
    expect(ticket().checkIns?.['2026-10-06']).toBeTruthy();
  });

  it('refuses residents abroad without writing', async () => {
    seed({ track: 'abroad' });
    const result = await scanAt('2026-10-06T07:15:00.000Z', signTicket(REG_ID));
    expect(result.status).toBe(403);
    expect(result.body.messageAr).toBe('كود الحضور (QR) غير متاح للمقيمين خارج مصر');
    expect(ticket().checkIns).toBeUndefined();
  });
});
