import { createMiddleware } from 'hono/factory';
import { getDb } from '../../db/client';
import { findIdempotencyCache, insertIdempotencyCache, deleteExpiredIdempotencyCache } from '../../db/queries/idempotency.queries';

const cleanupInterval = setInterval(async () => {
  try {
    const sql = getDb();
    await deleteExpiredIdempotencyCache(sql);
  } catch { /* ignore */ }
}, 3600_000);

if ((cleanupInterval as any).unref) (cleanupInterval as any).unref();

export const idempotencyMiddleware = createMiddleware(async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(c.req.method)) {
    return next();
  }

  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!idempotencyKey) {
    return next();
  }

  const sql = getDb();

  const cached = await findIdempotencyCache(sql, idempotencyKey);
  if (cached) {
    return c.json(cached.response_body, cached.response_status as any);
  }

  await next();

  const res = c.res;

  if (res.status >= 200 && res.status < 300) {
    const body = await res.clone().json();
    await insertIdempotencyCache(sql, idempotencyKey, res.status, body);
  }
});
