/**
 * Pre-filled WhatsApp body when approval succeeds or admin shares the attendance QR link.
 */
export function attendanceQrApprovedMessage(ticketUrl: string): string {
  return (
    `تم قبول تسجيلك في دورة التاريخ الكنسي بنجاح ✓\n\n` +
    `رابط كود الحضور (QR):\n${ticketUrl}\n\n` +
    `يرجى إظهار رمز QR للحضور عند الدخول.`
  );
}
