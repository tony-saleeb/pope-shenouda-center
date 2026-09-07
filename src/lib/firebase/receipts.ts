import { getAdminDb } from '@/lib/firebase/admin';
import { getAdminImageCache, setAdminImageCache } from '@/lib/adminReadCache';

export const RECEIPTS_COLLECTION = 'receipts';
export const PORTRAITS_COLLECTION = 'portraits';
/** Firestore documents are capped at 1MB; leave headroom for metadata. */
export const MAX_STORED_RECEIPT_BYTES = 800 * 1024;

export function receiptPointer(registrantId: string): string {
  return imagePointer(RECEIPTS_COLLECTION, registrantId);
}

export function portraitPointer(registrantId: string): string {
  return imagePointer(PORTRAITS_COLLECTION, registrantId);
}

export function isLegacyInlineReceipt(value: string): boolean {
  return value.startsWith('data:image/');
}

function imagePointer(collection: string, registrantId: string): string {
  return `${collection}/${registrantId}`;
}

function registrantIdFromPointer(collection: string, path: string): string | null {
  const prefix = `${collection}/`;
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

export const portraitWriteFields = receiptWriteFields;

export type StoredImagePayload =
  | { kind: 'bytes'; bytes: Buffer; contentType: string }
  | { kind: 'url'; url: string };

const IMAGE_CACHE_TTL_MS = 90_000;

function imageToBuffer(image: unknown): Buffer | null {
  if (!image) return null;
  if (Buffer.isBuffer(image)) return image;
  if (image instanceof Uint8Array) return Buffer.from(image);
  const base64 = imageToBase64(image);
  if (!base64) return null;
  return Buffer.from(base64, 'base64');
}

function parseInlineOrRemoteImage(path: string): StoredImagePayload | null {
  if (isLegacyInlineReceipt(path)) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(path);
    if (!match) return null;
    return { kind: 'bytes', bytes: Buffer.from(match[2], 'base64'), contentType: match[1] };
  }
  if (path.startsWith('https://')) {
    return { kind: 'url', url: path };
  }
  return null;
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

async function deleteStoredImage(collection: string, path: string | null | undefined): Promise<void> {
  if (!path || isLegacyInlineReceipt(path) || path.startsWith('http')) return;
  const registrantId = registrantIdFromPointer(collection, path);
  if (!registrantId) return;
  try {
    await getAdminDb().collection(collection).doc(registrantId).delete();
  } catch (error) {
    console.error(`[${collection}] Failed to delete document:`, error);
  }
}

async function getStoredImagePayload(
  collection: string,
  path: string | null | undefined
): Promise<StoredImagePayload | null> {
  if (!path) return null;
  const direct = parseInlineOrRemoteImage(path);
  if (direct) return direct;

  const registrantId = registrantIdFromPointer(collection, path);
  if (!registrantId) return null;

  const snap = await getAdminDb().collection(collection).doc(registrantId).get();
  if (!snap.exists) return null;

  const data = snap.data();
  const contentType =
    typeof data?.contentType === 'string' && data.contentType.startsWith('image/')
      ? data.contentType
      : 'image/jpeg';
  const bytes = imageToBuffer(data?.image);
  if (!bytes) return null;
  return { kind: 'bytes', bytes, contentType };
}

export async function deleteRegistrantReceipt(path: string | null | undefined): Promise<void> {
  return deleteStoredImage(RECEIPTS_COLLECTION, path);
}

export async function deleteRegistrantPortrait(path: string | null | undefined): Promise<void> {
  return deleteStoredImage(PORTRAITS_COLLECTION, path);
}

async function getStoredImagePayloadForRegistrant(
  collection: string,
  registrantId: string,
  field: 'paymentScreenshotUrl' | 'portraitUrl'
): Promise<StoredImagePayload | null> {
  const cacheKey = `${collection}:${registrantId}`;
  const cached = getAdminImageCache<StoredImagePayload>(cacheKey);
  if (cached) return cached;

  const pointer = imagePointer(collection, registrantId);
  const stored = await getStoredImagePayload(collection, pointer);
  if (stored) {
    setAdminImageCache(cacheKey, stored, IMAGE_CACHE_TTL_MS);
    return stored;
  }

  const snap = await getAdminDb().collection('registrants').doc(registrantId).get();
  const path = snap.data()?.[field];
  if (typeof path !== 'string' || !path || path === pointer) return null;
  const fallback = await getStoredImagePayload(collection, path);
  if (fallback) setAdminImageCache(cacheKey, fallback, IMAGE_CACHE_TTL_MS);
  return fallback;
}

export async function getReceiptPayloadForRegistrant(registrantId: string): Promise<StoredImagePayload | null> {
  return getStoredImagePayloadForRegistrant(RECEIPTS_COLLECTION, registrantId, 'paymentScreenshotUrl');
}

export async function getPortraitPayloadForRegistrant(registrantId: string): Promise<StoredImagePayload | null> {
  return getStoredImagePayloadForRegistrant(PORTRAITS_COLLECTION, registrantId, 'portraitUrl');
}
