import * as Sentry from '@sentry/node';
import { logger } from '../logger';

export function reportBillingError(context: Record<string, unknown>, message: string, err?: unknown): void {
  logger.error({ ...context, err }, message);
  if (err) {
    Sentry.captureException(err, { extra: { ...context, message } });
  }
}
