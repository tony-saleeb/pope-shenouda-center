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

  it('returns 404 when phone is not registered', async () => {
    (getAdminDb as any).mockReturnValue({
      collection: () => ({
        doc: () => ({ get: vi.fn().mockResolvedValue({ exists: false }) }),
      }),
    });

    const req = new NextRequest('http://localhost/api/public/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01012345678' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.messageAr).toContain('غير مسجّل لدينا');
    expect(sendAutomatedWhatsAppTicket).not.toHaveBeenCalled();
  });

  it('returns 200 and registrantId when phone exists', async () => {
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

    const req = new NextRequest('http://localhost/api/public/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01012345678' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.registrantId).toBe('reg-456');
    expect(sendAutomatedWhatsAppTicket).toHaveBeenCalledWith('01012345678', 'reg-456');
  });
});
