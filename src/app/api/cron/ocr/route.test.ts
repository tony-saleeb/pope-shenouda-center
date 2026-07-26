import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('GET /api/cron/ocr', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret-1234567890';
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it('throws an error if CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET;
    const req = new NextRequest('http://localhost/api/cron/ocr');
    await expect(GET(req)).rejects.toThrow('CRON_SECRET is required');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = new NextRequest('http://localhost/api/cron/ocr');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when query parameter key= is passed instead of header', async () => {
    const req = new NextRequest('http://localhost/api/cron/ocr?key=test-cron-secret-1234567890');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header contains wrong secret', async () => {
    const req = new NextRequest('http://localhost/api/cron/ocr', {
      headers: { Authorization: 'Bearer wrong-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header is not Bearer format', async () => {
    const req = new NextRequest('http://localhost/api/cron/ocr', {
      headers: { Authorization: 'Basic test-cron-secret-1234567890' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
