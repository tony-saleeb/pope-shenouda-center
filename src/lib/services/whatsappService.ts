import { formatEgyptianPhone } from '../utils/formatters';

/**
 * Generate universal WhatsApp web link (wa.me) with pre-filled ticket message.
 */
export function getWhatsAppTicketUrl(registrantId: string, phone: string, baseUrl?: string): string {
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://ticket-reg-10century.vercel.app');
  const ticketUrl = `${origin}/ticket/${registrantId}`;

  const messageText =
    `تم قبول تسجيلك في مؤتمر القرن العاشر بنجاح ✓\n\n` +
    `رابط تذكرتك:\n${ticketUrl}\n\n` +
    `للانضمام لجروب المؤتمر على واتساب، يرجى طلب الانضمام من خلال الرابط التالي:\nhttps://chat.whatsapp.com/LjFzmby813CH21gR4Ayxsw?s=cl&p=i&ilr=4&amv=1\n\n` +
    `يرجى إظهار التذكرة عند الدخول.`;

  const encodedText = encodeURIComponent(messageText);
  const cleanPhone = formatEgyptianPhone(phone);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

/**
 * Send automated WhatsApp ticket message via configured background gateways (Green API, UltraMsg, Webhook).
 */
export async function sendAutomatedWhatsAppTicket(
  phoneNumber: string,
  registrantId: string,
  baseUrl: string = 'https://ticket-reg-10century.vercel.app'
): Promise<{ sent: boolean; provider?: string; error?: string }> {
  const cleanPhone = formatEgyptianPhone(phoneNumber);
  const ticketUrl = `${baseUrl}/ticket/${registrantId}`;
  const messageText =
    `تم قبول تسجيلك في مؤتمر القرن العاشر بنجاح ✓\n\n` +
    `رابط تذكرتك:\n${ticketUrl}\n\n` +
    `للانضمام لجروب المؤتمر على واتساب، يرجى طلب الانضمام من خلال الرابط التالي:\nhttps://chat.whatsapp.com/LjFzmby813CH21gR4Ayxsw?s=cl&p=i&ilr=4&amv=1\n\n` +
    `يرجى إظهار التذكرة عند الدخول.`;

  // 1. Check Green API
  const greenInstance = process.env.GREENAPI_INSTANCE_ID;
  const greenToken = process.env.GREENAPI_API_TOKEN;
  if (greenInstance && greenToken) {
    try {
      const response = await fetch(`https://api.green-api.com/waInstance${greenInstance}/sendMessage/${greenToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: `${cleanPhone}@c.us`,
          message: messageText,
        }),
      });
      const data = await response.json();
      if (data && data.idMessage) {
        return { sent: true, provider: 'green-api' };
      }
    } catch (err) {
      console.error('Green API error:', err);
    }
  }

  // 2. Check UltraMsg API
  const instanceId = process.env.ULTRAMSG_INSTANCE_ID || process.env.WHATSAPP_INSTANCE_ID;
  const token = process.env.ULTRAMSG_TOKEN || process.env.WHATSAPP_API_TOKEN;
  if (instanceId && token) {
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
    } catch (err) {
      console.error('UltraMsg error:', err);
    }
  }

  // 3. Check Generic Webhook / Local Bot
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          registrantId,
          ticketUrl,
          message: messageText,
        }),
      });
      if (response.ok) {
        return { sent: true, provider: 'webhook' };
      }
    } catch (err) {
      console.error('WhatsApp Webhook error:', err);
    }
  }

  return { sent: false, error: 'No active WhatsApp API service configured' };
}
