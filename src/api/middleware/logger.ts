import { createMiddleware } from 'hono/factory';
import { logger } from '../../logger';

export const loggingMiddleware = createMiddleware(async (c, next) => {
  const start = performance.now();
  const { method, path } = c.req;
  const requestId = c.var.requestId;

  await next();

  const durationMs = Math.round(performance.now() - start);

  logger.info({
    requestId,
    method,
    path,
    status: c.res.status,
    durationMs,
  });
});
