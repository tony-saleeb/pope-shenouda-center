import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: vi.fn(),
}));

vi.mock('@/lib/whatsapp/api', () => ({
  sendAutomatedWhatsAppTicket: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/ratelimit', () => ({
  getLimiter: vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({ success: true, reset: Date.now() + 60000 }),
  }),
  limitByIp: vi.fn().mockResolvedValue(null),
}));

import { getAdminDb } from '@/lib/firebase/admin';
import { sendAutomatedWhatsAppTicket } from '@/lib/whatsapp/api';

describe('POST /api/public/lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid Egyptian phone format', async () => {
    const req = new NextRequest('http://localhost/api/public/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '123' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.messageAr).toBe('رقم الموبايل غير صحيح، تأكد من كتابة ١١ رقم يبدأ بـ 01');
  });

  it('returns identical 200 anti-enumeration response whether phone exists or not', async () => {
    // Test Case 1: Phone does not exist
    (getAdminDb as any).mockReturnValue({
      collection: () => ({
        doc: () => ({ get: vi.fn().mockResolvedValue({ exists: false }) }),
      }),
    });

    const req1 = new NextRequest('http://localhost/api/public/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01012345678' }),
    });

    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.messageAr).toBe('لو الرقم مسجّل عندنا، هيوصلك رابط التذكرة على الواتساب خلال دقائق.');
    expect(sendAutomatedWhatsAppTicket).not.toHaveBeenCalled();

    // Test Case 2: Phone exists
    (getAdminDb as any).mockReturnValue({
      collection: () => ({
        doc: () => ({
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ registrantId: 'reg-456' }),
          }),
        }),
      }),
    });

    const req2 = new NextRequest('http://localhost/api/public/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01012345678' }),
    });

    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    // Identical response body!
    expect(json2).toEqual(json1);
    expect(sendAutomatedWhatsAppTicket).toHaveBeenCalledWith('01012345678', 'reg-456');
  });
});
