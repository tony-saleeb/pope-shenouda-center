import { describe, it, expect } from 'vitest';
import { attendanceQrApprovedMessage } from './templates';

describe('attendanceQrApprovedMessage', () => {
  it('includes the attendance QR link and no WhatsApp group invite', () => {
    const url = 'https://pope-shenouda-center.vercel.app/ticket/abc';
    const message = attendanceQrApprovedMessage(url);

    expect(message).toContain('رابط كود الحضور (QR):');
    expect(message).toContain(url);
    expect(message).toContain('يرجى إظهار رمز QR للحضور عند الدخول.');
    expect(message).not.toContain('تذكرة');
    expect(message).not.toContain('chat.whatsapp.com');
    expect(message).not.toContain('جروب');
  });
});
