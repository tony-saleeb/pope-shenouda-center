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

/**
 * Limit a request by client IP address derived from `x-forwarded-for`.
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

  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';

  const { success, reset } = await limiter.limit(ip);

  if (!success) {
    const retryAfterSeconds = Math.ceil(Math.max(0, reset - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: 'Too many requests',
        messageAr: 'محاولات كثيرة، برجاء المحاولة بعد قليل',
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
