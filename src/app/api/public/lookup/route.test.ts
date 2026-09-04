import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: vi.fn(),
}));

vi.mock('@/lib/whatsapp/api', () => ({
  sendAutomatedWhatsAppTicket: vi.fn().mockResolvedValue({ sent: true }),
}));

vi.mock('@/lib/ratelimit', () => ({
  getLimiter: vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({ success: true, reset: Date.now() + 60000 }),
  }),
  limitByIp: vi.fn().mockResolvedValue(null),
}));

import { getAdminDb } from '@/lib/firebase/admin';
import { sendAutomatedWhatsAppTicket } from '@/lib/whatsapp/api';

const ANTI_ENUMERATION_MESSAGE =
  'لو الرقم مسجّل عندنا، هيوصلك رابط كود الحضور (QR) على الواتساب خلال دقائق.';

function mockDb(registrantTrack: string) {
  (getAdminDb as any).mockReturnValue({
    collection: (name: string) => ({
      doc: () => ({
        get: vi.fn().mockResolvedValue(
          name === 'phoneIndex'
            ? { exists: true, data: () => ({ registrantId: 'reg-456' }) }
            : name === 'registrants'
              ? { exists: true, data: () => ({ track: registrantTrack }) }
              : { exists: false }
        ),
      }),
    }),
  });
}

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

  it('returns the same 200 body when phone is not registered', async () => {
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
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.messageAr).toBe(ANTI_ENUMERATION_MESSAGE);
    expect(json.registrantId).toBeUndefined();
    expect(sendAutomatedWhatsAppTicket).not.toHaveBeenCalled();
  });

  it('sends WhatsApp for onsite (انتظامي) track without leaking registrantId', async () => {
    mockDb('onsite_exam_onsite');

    const req = new NextRequest('http://localhost/api/public/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01012345678' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.messageAr).toBe(ANTI_ENUMERATION_MESSAGE);
    expect(json.registrantId).toBeUndefined();
    expect(sendAutomatedWhatsAppTicket).toHaveBeenCalledWith('01012345678', 'reg-456');
  });

  it.each(['online_exam_onsite', 'online_no_exam', 'abroad'] as const)(
    'does not send WhatsApp for non-onsite track %s',
    async (track) => {
      mockDb(track);

      const req = new NextRequest('http://localhost/api/public/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '01012345678' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.messageAr).toBe(ANTI_ENUMERATION_MESSAGE);
      expect(json.registrantId).toBeUndefined();
      expect(sendAutomatedWhatsAppTicket).not.toHaveBeenCalled();
    }
  );
});
