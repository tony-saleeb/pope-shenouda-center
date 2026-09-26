import { describe, expect, it } from 'vitest';
import { attendanceTicketWrite } from './issueAttendanceTicket';

describe('attendanceTicketWrite', () => {
  const qr = { qrToken: 'id.sig', qrImageUrl: 'data:image/png;base64,abc' };

  it('refreshes only the QR when a ticket already exists', () => {
    const write = attendanceTicketWrite(true, qr);
    expect(write.merge).toBe(true);
    expect(write.fields).toEqual({
      qrToken: qr.qrToken,
      qrImageUrl: qr.qrImageUrl,
    });
  });

  it('creates an unused ticket when none exists', () => {
    const write = attendanceTicketWrite(false, qr);
    expect(write.merge).toBe(false);
    expect(write.fields.used).toBe(false);
    expect(write.fields.usedAt).toBeNull();
    expect(write.fields.usedByUsherId).toBeNull();
    expect(write.fields.qrToken).toBe(qr.qrToken);
    expect(write.fields.checkIns).toBeUndefined();
  });
});
