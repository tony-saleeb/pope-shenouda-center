import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: vi.fn(),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ authorized: true, uid: 'admin-1', role: 'admin' }),
}));

vi.mock('@/lib/qr/issueAttendanceTicket', () => ({
  issueAttendanceTicket: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/whatsapp/api', () => ({
  sendAutomatedWhatsAppTicket: vi.fn().mockResolvedValue({ sent: true }),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__serverTimestamp__' },
}));

import { getAdminDb } from '@/lib/firebase/admin';
import { issueAttendanceTicket } from '@/lib/qr/issueAttendanceTicket';
import { sendAutomatedWhatsAppTicket } from '@/lib/whatsapp/api';

function mockRegistrant(track: string) {
  const update = vi.fn().mockResolvedValue(undefined);
  (getAdminDb as any).mockReturnValue({
    collection: () => ({
      doc: () => ({
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            track,
            whatsappNumber: '01012345678',
            phoneNumber: '01012345678',
          }),
        }),
        update,
      }),
    }),
  });
  return update;
}

describe('POST /api/admin/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues attendance QR and WhatsApp for انتظامي', async () => {
    mockRegistrant('onsite_exam_onsite');

    const req = new NextRequest('http://localhost/api/admin/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrantId: 'reg-onsite' }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.attendanceQrIssued).toBe(true);
    expect(json.whatsappSent).toBe(true);
    expect(issueAttendanceTicket).toHaveBeenCalled();
    expect(sendAutomatedWhatsAppTicket).toHaveBeenCalledWith('01012345678', 'reg-onsite');
  });

  it.each(['online_exam_onsite', 'online_no_exam', 'abroad'] as const)(
    'approves %s without QR or WhatsApp',
    async (track) => {
      mockRegistrant(track);

      const req = new NextRequest('http://localhost/api/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrantId: 'reg-other' }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.attendanceQrIssued).toBe(false);
      expect(json.whatsappSent).toBe(false);
      expect(issueAttendanceTicket).not.toHaveBeenCalled();
      expect(sendAutomatedWhatsAppTicket).not.toHaveBeenCalled();
    }
  );
});
