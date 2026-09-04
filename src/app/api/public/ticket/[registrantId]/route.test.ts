import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  getLimiter: vi.fn().mockReturnValue({}),
  limitByIp: vi.fn().mockResolvedValue(null),
}));

import { getAdminDb } from '@/lib/firebase/admin';

describe('GET /api/public/ticket/[registrantId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 if registrant status is not approved or auto_approved', async () => {
    const mockRegData = {
      status: 'pending_verification',
      fullName: 'Jane Doe',
      church: 'St. George',
    };

    (getAdminDb as any).mockReturnValue({
      collection: (col: string) => {
        if (col === 'registrants') {
          return {
            doc: () => ({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => mockRegData,
              }),
            }),
          };
        }
        return { doc: () => ({ get: vi.fn() }) };
      },
    });

    const req = new NextRequest('http://localhost/api/public/ticket/reg-pending');
    const res = await GET(req, { params: Promise.resolve({ registrantId: 'reg-pending' }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.messageAr).toBe('التسجيل غير مقبول بعد — التذكرة تظهر فقط للطلبات المقبولة');
  });

  it('returns 403 when an approved registrant is not on the انتظامي track', async () => {
    const mockRegData = {
      status: 'approved',
      fullName: 'Jane Doe',
      church: 'St. George',
      track: 'online_exam_onsite',
    };

    (getAdminDb as any).mockReturnValue({
      collection: (col: string) => {
        if (col === 'registrants') {
          return {
            doc: () => ({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => mockRegData,
              }),
            }),
          };
        }
        return { doc: () => ({ get: vi.fn() }) };
      },
    });

    const req = new NextRequest('http://localhost/api/public/ticket/reg-online');
    const res = await GET(req, { params: Promise.resolve({ registrantId: 'reg-online' }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.messageAr).toBe('كود الحضور (QR) متاح فقط لمسار الانتظامي — الحضور في المركز');
  });

  it('returns 200 with ONLY sanitized ticket fields (fullName, church, qrImageUrl, used, usedAt) and NEVER returns qrToken', async () => {
    const mockRegData = {
      status: 'approved',
      fullName: 'Jane Doe',
      church: 'St. George',
      track: 'onsite_exam_onsite',
    };

    const mockTicketData = {
      qrToken: 'reg-approved.1234567890abcdef',
      qrImageUrl: 'data:image/png;base64,iVBORw0KGgo...',
      used: false,
      usedAt: null,
    };

    (getAdminDb as any).mockReturnValue({
      collection: (col: string) => {
        if (col === 'registrants') {
          return {
            doc: () => ({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => mockRegData,
              }),
            }),
          };
        }
        if (col === 'tickets') {
          return {
            doc: () => ({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => mockTicketData,
              }),
            }),
          };
        }
        return { doc: () => ({ get: vi.fn() }) };
      },
    });

    const req = new NextRequest('http://localhost/api/public/ticket/reg-approved');
    const res = await GET(req, { params: Promise.resolve({ registrantId: 'reg-approved' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const json = await res.json();
    expect(json).toEqual({
      fullName: 'Jane Doe',
      church: 'St. George',
      qrImageUrl: 'data:image/png;base64,iVBORw0KGgo...',
      used: false,
      usedAt: null,
    });

    // Ensure raw qrToken is NEVER exposed in API response
    expect(json.qrToken).toBeUndefined();
  });
});
