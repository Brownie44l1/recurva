import { config } from './config';
import { logger } from './logger';
import { createApp } from './api/app';
import { getDb, closeDb } from './db/client';
import { startDunningScheduler, stopDunningScheduler } from './scheduler/dunning-runner';

const app = createApp();

getDb();

startDunningScheduler();

const server = Bun.serve({
  port: config.PORT,
  fetch: app.fetch,
  idleTimeout: 255,
});

logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Recurva listening');

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  stopDunningScheduler();
  server.stop();
  await closeDb();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down');
  stopDunningScheduler();
  server.stop();
  await closeDb();
  process.exit(0);
});
