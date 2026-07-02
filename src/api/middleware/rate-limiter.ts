import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

interface RateLimitOptions {
  windowMs: number;
  maxRead: number;
  maxWrite: number;
}

export function rateLimiter(opts: RateLimitOptions) {
  const { windowMs, maxRead, maxWrite } = opts;

  const hits = new Map<string, number[]>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    }
  }, 60_000);

  if (cleanup.unref) cleanup.unref();

  return createMiddleware(async (c, next) => {
    const key = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      || c.req.header('x-real-ip')
      || 'unknown';
    const now = Date.now();

    const isRead = c.req.method === 'GET' || c.req.method === 'HEAD';
    const max = isRead ? maxRead : maxWrite;

    let timestamps = hits.get(key) ?? [];
    timestamps = timestamps.filter(t => now - t < windowMs);

    if (timestamps.length >= max) {
      const retryAfter = Math.ceil((timestamps[0]! + windowMs - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Limit', String(max));
      c.header('X-RateLimit-Remaining', '0');
      throw new HTTPException(429, { message: 'Too Many Requests' });
    }

    timestamps.push(now);
    hits.set(key, timestamps);

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(max - timestamps.length));

    await next();
  });
}
