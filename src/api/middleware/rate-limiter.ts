import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { getDb } from '../../db/client';

interface RateLimitOptions {
  windowMs: number;
  maxRead: number;
  maxWrite: number;
}

export function rateLimiter(opts: RateLimitOptions) {
  const { windowMs, maxRead, maxWrite } = opts;

  return createMiddleware(async (c, next) => {
    const key = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      || c.req.header('x-real-ip')
      || 'unknown';

    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;

    const isRead = c.req.method === 'GET' || c.req.method === 'HEAD';
    const max = isRead ? maxRead : maxWrite;

    const sql = getDb();

    await sql.begin(async (tx) => {
      await tx`
        DELETE FROM rate_limits WHERE key = ${key} AND window_start < ${windowStart}
      `;

      const [row] = await tx<{ count: number }[]>`
        INSERT INTO rate_limits (key, window_start, count)
        VALUES (${key}, ${windowStart}, 1)
        ON CONFLICT (key, window_start)
        DO UPDATE SET count = rate_limits.count + 1
        RETURNING count
      `;

      const currentCount = row!.count;

      if (currentCount > max) {
        const retryAfter = Math.ceil((windowStart + windowMs - now) / 1000);
        c.header('Retry-After', String(retryAfter));
        c.header('X-RateLimit-Limit', String(max));
        c.header('X-RateLimit-Remaining', '0');
        throw new HTTPException(429, { message: 'Too Many Requests' });
      }

      c.header('X-RateLimit-Limit', String(max));
      c.header('X-RateLimit-Remaining', String(max - currentCount));
    });

    await next();
  });
}
