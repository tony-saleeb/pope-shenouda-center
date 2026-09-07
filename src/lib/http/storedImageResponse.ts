import { NextResponse } from 'next/server';
import type { StoredImagePayload } from '@/lib/firebase/receipts';
import { safeImageSrc } from '@/lib/validation';

export function storedImageResponse(payload: StoredImagePayload | null): NextResponse {
  if (!payload) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (payload.kind === 'url') {
    const safeUrl = safeImageSrc(payload.url);
    if (!safeUrl) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ url: safeUrl });
  }

  return new NextResponse(Uint8Array.from(payload.bytes), {
    status: 200,
    headers: {
      'Content-Type': payload.contentType,
      'Cache-Control': 'private, max-age=120',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
