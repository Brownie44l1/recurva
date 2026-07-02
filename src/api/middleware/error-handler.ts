import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DomainError } from '../../errors';
import { logger } from '../../logger';

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.var.requestId;

  if (err instanceof DomainError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          details: (err as any).details ?? undefined,
        },
        requestId,
      },
      err.statusCode as any,
    );
  }

  if (err instanceof HTTPException) {
    return c.json(
      {
        error: {
          code: err.status === 429 ? 'rate_limit_exceeded' : 'http_exception',
          message: err.message,
        },
        requestId,
      },
      err.status,
    );
  }

  logger.error({ err, requestId }, 'Unhandled error');

  return c.json(
    {
      error: {
        code: 'internal_server_error',
        message: 'An unexpected error occurred',
      },
      requestId,
    },
    500,
  );
};

