import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Create a rate-limiter instance using Upstash Redis sliding window.
 */
export function getLimiter(name: string, requests: number, windowDuration: Duration) {
  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(requests, windowDuration),
    prefix: `rl:${name}`,
  });
}

/** First hop of a forwarding header, only when it looks like an IP. */
function firstForwardedIp(header: string | null): string | null {
  if (!header) return null;
  const candidate = header.split(',')[0]?.trim() ?? '';
  if (!candidate || candidate.length > 45) return null;
  if (!/^[0-9A-Fa-f:.]+$/.test(candidate)) return null;
  return candidate;
}

/**
 * Address used as the rate-limit key.
 * On Vercel, only headers the platform sets are trusted. Vercel overwrites
 * them from the connection, so a caller cannot pick a fresh bucket.
 * Off Vercel, forwarding headers are client-controlled and are ignored.
 */
export function rateLimitIp(request: NextRequest): string {
  if (process.env.VERCEL === '1') {
    return (
      firstForwardedIp(request.headers.get('x-vercel-forwarded-for')) ??
      firstForwardedIp(request.headers.get('x-real-ip')) ??
      firstForwardedIp(request.headers.get('x-forwarded-for')) ??
      'unknown'
    );
  }
  return 'unknown';
}

/**
 * Limit a request by the platform client IP.
 *
 * FAIL CLOSED: If UPSTASH_REDIS_REST_URL is missing, throws an Error at call time
 * to prevent un-throttled public access.
 *
 * @returns 429 NextResponse if rate limit exceeded, or null if allowed.
 */
export async function limitByIp(
  request: NextRequest,
  limiter: Ratelimit
): Promise<Response | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    throw new Error('UPSTASH_REDIS_REST_URL is required for rate limiting');
  }

  const ip = rateLimitIp(request);

  const { success, reset } = await limiter.limit(ip);

  if (!success) {
    const retryAfterSeconds = Math.ceil(Math.max(0, reset - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: 'Too many requests',
        messageAr: 'تم الوصول للحد الأقصى للمحاولات المؤقت، برجاء الانتظار دقيقة والمحاولة مرة أخرى.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
        },
      }
    );
  }

  return null;
}
