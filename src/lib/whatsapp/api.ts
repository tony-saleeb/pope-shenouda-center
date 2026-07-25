/**
 * Send automated WhatsApp ticket message via UltraMsg / Cloud API if configured in environment.
 */
export async function sendAutomatedWhatsAppTicket(
  phoneNumber: string,
  registrantId: string,
  baseUrl: string = 'https://ticket-reg-10century.vercel.app'
): Promise<{ sent: boolean; provider?: string; error?: string }> {
  const instanceId = process.env.ULTRAMSG_INSTANCE_ID || process.env.WHATSAPP_INSTANCE_ID;
  const token = process.env.ULTRAMSG_TOKEN || process.env.WHATSAPP_API_TOKEN;

  if (!instanceId || !token) {
    return { sent: false, error: 'No WhatsApp API token configured' };
  }

  // Format phone number to international 20XXXXXXXXXX
  let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '20' + cleanPhone.substring(1);
  }
  if (!cleanPhone.startsWith('20') && cleanPhone.length === 10) {
    cleanPhone = '20' + cleanPhone;
  }

  const ticketUrl = `${baseUrl}/ticket/${registrantId}`;
  const messageText =
    `تم قبول تسجيلك في مؤتمر القرن العاشر بنجاح 🎉\n\n` +
    `📲 رابط تذكرتك:\n${ticketUrl}\n\n` +
    `يرجى إظهار التذكرة عند الدخول.`;

  try {
    const response = await fetch(`https://api.ultramsg.com/${instanceId}/messages/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        to: cleanPhone,
        body: messageText,
      }),
    });

    const data = await response.json();
    if (data && (data.sent === 'true' || data.id)) {
      return { sent: true, provider: 'ultramsg' };
    }
    return { sent: false, error: data.error || 'API response failed' };
  } catch (err) {
    console.error('WhatsApp background send error:', err);
    return { sent: false, error: String(err) };
  }
}
