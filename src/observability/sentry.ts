import * as Sentry from '@sentry/node';
import { config } from '../config';
import { logger } from '../logger';

export function initSentry(): void {
  if (!config.SENTRY_DSN) {
    logger.info('SENTRY_DSN not set — skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT,
  });

  logger.info({ environment: config.SENTRY_ENVIRONMENT }, 'Sentry initialized');
}
