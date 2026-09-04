import { TRACKS } from '@/lib/registrationTracks';

/** Center WhatsApp for abroad (USD) payment details. */
export const ABROAD_PAYMENT_WHATSAPP = '201277929104';

/**
 * Pre-filled WhatsApp body when approval succeeds or admin shares the attendance QR link.
 */
export function attendanceQrApprovedMessage(ticketUrl: string): string {
  return (
    `تم قبول تسجيلك في دراسة التاريخ الكنسي بنجاح ✓\n\n` +
    `رابط كود الحضور (QR):\n${ticketUrl}\n\n` +
    `يرجى إظهار رمز QR للحضور عند الدخول.`
  );
}

/**
 * Pre-filled inquiry from an abroad registrant asking how to pay 50 USD.
 */
export function abroadPaymentInquiryMessage(): string {
  const fee = TRACKS.abroad;
  return (
    `أنا مقيم خارج مصر وأرغب في التسجيل في دراسة التاريخ الكنسي.\n\n` +
    `المسار: المقيمون خارج مصر\n` +
    `المبلغ: ${fee.amount}$ USD\n\n` +
    `من فضلكم أرسلوا تفاصيل التحويل لإتمام الدفع، وسأرفع صورة الإيصال بعد ذلك في الاستمارة.`
  );
}

export function getAbroadPaymentWhatsAppUrl(): string {
  return `https://wa.me/${ABROAD_PAYMENT_WHATSAPP}?text=${encodeURIComponent(abroadPaymentInquiryMessage())}`;
}
