import QRCode from 'qrcode';
import { signTicket } from './hmac';

/**
 * Generate a QR code for a given ticket/registrant ID.
 * Returns a base64 encoded PNG Data URL.
 * Error correction level M is used for optimal module chunkiness and fast range scanning.
 */
export async function generateQrCodeDataUrl(ticketId: string): Promise<string> {
  const token = signTicket(ticketId);
  return await QRCode.toDataURL(token, {
    width: 500,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
}
