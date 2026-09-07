'use client';

import { safeImageSrc } from '@/lib/validation';

const blobUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(kind: 'portrait' | 'receipt', registrantId: string): string {
  return `${kind}:${registrantId}`;
}

export function forgetAdminStoredImage(kind: 'portrait' | 'receipt', registrantId: string): void {
  const key = cacheKey(kind, registrantId);
  const url = blobUrls.get(key);
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  blobUrls.delete(key);
  inflight.delete(key);
}

export async function loadAdminStoredImage(
  getToken: () => Promise<string>,
  kind: 'portrait' | 'receipt',
  registrantId: string
): Promise<string | null> {
  const key = cacheKey(kind, registrantId);
  const cached = blobUrls.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const token = await getToken();
    const response = await fetch(`/api/admin/${kind}/${registrantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.startsWith('image/')) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      blobUrls.set(key, url);
      return url;
    }

    const payload = (await response.json()) as { url?: string };
    const src = payload.url ? safeImageSrc(payload.url) : null;
    if (src) blobUrls.set(key, src);
    return src;
  })();

  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}
