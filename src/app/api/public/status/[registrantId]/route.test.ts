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

describe('GET /api/public/status/[registrantId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when registrant does not exist', async () => {
    const mockGet = vi.fn().mockResolvedValue({ exists: false });
    (getAdminDb as any).mockReturnValue({
      collection: () => ({
        doc: () => ({ get: mockGet }),
      }),
    });

    const req = new NextRequest('http://localhost/api/public/status/non-existent');
    const res = await GET(req, { params: Promise.resolve({ registrantId: 'non-existent' }) });

    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns ONLY sanitized fields (status, fullName, church, createdAt) when registrant exists', async () => {
    const mockData = {
      status: 'pending_verification',
      fullName: 'John Doe',
      church: 'St. Mark',
      phoneNumber: '01234567890',
      whatsappNumber: '01234567890',
      paymentScreenshotUrl: 'https://secret.url/image.png',
      adminNotes: 'Confidential note',
      ocrExtractedAmount: 100,
      track: 'onsite_exam_onsite',
      createdAt: { toDate: () => new Date('2026-07-26T20:00:00Z') },
    };

    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => mockData,
    });

    (getAdminDb as any).mockReturnValue({
      collection: () => ({
        doc: () => ({ get: mockGet }),
      }),
    });

    const req = new NextRequest('http://localhost/api/public/status/reg-123');
    const res = await GET(req, { params: Promise.resolve({ registrantId: 'reg-123' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const json = await res.json();
    expect(json).toEqual({
      status: 'pending_verification',
      fullName: 'John Doe',
      church: 'St. Mark',
      createdAt: '2026-07-26T20:00:00.000Z',
      track: 'onsite_exam_onsite',
      attendanceQrRequired: true,
    });

    // Ensure PII fields are strictly excluded
    expect(json.phoneNumber).toBeUndefined();
    expect(json.whatsappNumber).toBeUndefined();
    expect(json.paymentScreenshotUrl).toBeUndefined();
    expect(json.adminNotes).toBeUndefined();
    expect(json.ocrExtractedAmount).toBeUndefined();
  });
});
