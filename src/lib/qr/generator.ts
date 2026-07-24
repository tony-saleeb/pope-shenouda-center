import QRCode from 'qrcode';
import { signTicket } from './hmac';

/**
 * Generate an ultra-simple QR code for a given ticket/registrant ID.
 * Error correction level L + short token payload produces giant, chunky blocks
 * that scan instantly from any distance or camera quality.
 */
export async function generateQrCodeDataUrl(ticketId: string): Promise<string> {
  const token = signTicket(ticketId);
  return await QRCode.toDataURL(token, {
    width: 600,
    margin: 4,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'L',
  });
}
