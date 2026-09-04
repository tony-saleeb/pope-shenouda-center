import { getAdminDb } from '@/lib/firebase/admin';

export const RECEIPTS_COLLECTION = 'receipts';
/** Firestore documents are capped at 1MB; leave headroom for metadata. */
export const MAX_STORED_RECEIPT_BYTES = 800 * 1024;

export function receiptPointer(registrantId: string): string {
  return `${RECEIPTS_COLLECTION}/${registrantId}`;
}

export function isLegacyInlineReceipt(value: string): boolean {
  return value.startsWith('data:image/');
}

function registrantIdFromPointer(path: string): string | null {
  const prefix = `${RECEIPTS_COLLECTION}/`;
  if (!path.startsWith(prefix)) return null;
  const id = path.slice(prefix.length).trim();
  return id || null;
}

export function receiptWriteFields(bytes: Uint8Array, mimeType: string): {
  contentType: string;
  image: Buffer;
} {
  if (bytes.byteLength > MAX_STORED_RECEIPT_BYTES) {
    throw new Error('RECEIPT_TOO_LARGE');
  }
  return {
    contentType: mimeType,
    image: Buffer.from(bytes),
  };
}

function imageToBase64(image: unknown): string | null {
  if (!image) return null;
  if (Buffer.isBuffer(image)) return image.toString('base64');
  if (image instanceof Uint8Array) return Buffer.from(image).toString('base64');
  if (
    typeof image === 'object' &&
    image !== null &&
    'toBase64' in image &&
    typeof (image as { toBase64?: unknown }).toBase64 === 'function'
  ) {
    return (image as { toBase64: () => string }).toBase64();
  }
  return null;
}

export async function deleteRegistrantReceipt(path: string | null | undefined): Promise<void> {
  if (!path || isLegacyInlineReceipt(path) || path.startsWith('http')) return;
  const registrantId = registrantIdFromPointer(path);
  if (!registrantId) return;
  try {
    await getAdminDb().collection(RECEIPTS_COLLECTION).doc(registrantId).delete();
  } catch (error) {
    console.error('[Receipts] Failed to delete document:', error);
  }
}

export async function getReceiptReadUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (isLegacyInlineReceipt(path) || path.startsWith('https://')) return path;

  const registrantId = registrantIdFromPointer(path);
  if (!registrantId) return null;

  const snap = await getAdminDb().collection(RECEIPTS_COLLECTION).doc(registrantId).get();
  if (!snap.exists) return null;

  const data = snap.data();
  const contentType =
    typeof data?.contentType === 'string' && data.contentType.startsWith('image/')
      ? data.contentType
      : 'image/jpeg';
  const base64 = imageToBase64(data?.image);
  if (!base64) return null;
  return `data:${contentType};base64,${base64}`;
}
