import type { ErrorHandler } from 'hono';
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
