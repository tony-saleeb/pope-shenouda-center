import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { limitByIp } from './ratelimit';

describe('limitByIp', () => {
  const originalEnv = process.env.UPSTASH_REDIS_REST_URL;

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
  });

  afterEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = originalEnv;
  });

  it('fails closed and throws an error if UPSTASH_REDIS_REST_URL is missing', async () => {
    const req = new NextRequest('http://localhost/api/scan');
    const mockLimiter = {
      limit: vi.fn(),
    } as any;

    await expect(limitByIp(req, mockLimiter)).rejects.toThrow(
      'UPSTASH_REDIS_REST_URL is required for rate limiting'
    );
  });

  it('returns null when rate limit is not exceeded', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    const req = new NextRequest('http://localhost/api/scan', {
      headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
    });

    const mockLimiter = {
      limit: vi.fn().mockResolvedValue({ success: true, reset: Date.now() + 60000 }),
    } as any;

    const res = await limitByIp(req, mockLimiter);
    expect(res).toBeNull();
    expect(mockLimiter.limit).toHaveBeenCalledWith('203.0.113.195');
  });

  it('returns a 429 response with Retry-After header and Arabic message when limit is exceeded', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    const req = new NextRequest('http://localhost/api/scan', {
      headers: { 'x-forwarded-for': '198.51.100.44' },
    });

    const mockLimiter = {
      limit: vi.fn().mockResolvedValue({ success: false, reset: Date.now() + 15000 }),
    } as any;

    const res = await limitByIp(req, mockLimiter);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(429);
    expect(res?.headers.get('Retry-After')).toBeDefined();

    const body = await res?.json();
    expect(body).toEqual({
      error: 'Too many requests',
      messageAr: 'محاولات كثيرة، برجاء المحاولة بعد قليل',
    });
  });
});
