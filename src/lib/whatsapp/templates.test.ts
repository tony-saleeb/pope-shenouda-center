import { describe, it, expect } from 'vitest';
import {
  ABROAD_PAYMENT_WHATSAPP,
  abroadPaymentInquiryMessage,
  attendanceQrApprovedMessage,
  getAbroadPaymentWhatsAppUrl,
} from './templates';

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

describe('abroadPaymentInquiryMessage', () => {
  it('states the registrant is abroad and asks for 50 USD payment details', () => {
    const message = abroadPaymentInquiryMessage();

    expect(message).toContain('مقيم خارج مصر');
    expect(message).toContain('المقيمون خارج مصر');
    expect(message).toContain('50$ USD');
    expect(message).toContain('تفاصيل التحويل');
  });

  it('opens WhatsApp to the abroad payment number with the template pre-filled', () => {
    const url = getAbroadPaymentWhatsAppUrl();

    expect(ABROAD_PAYMENT_WHATSAPP).toBe('201277929104');
    expect(url.startsWith(`https://wa.me/${ABROAD_PAYMENT_WHATSAPP}?text=`)).toBe(true);
    expect(url).toContain(encodeURIComponent(abroadPaymentInquiryMessage()));
  });
});
