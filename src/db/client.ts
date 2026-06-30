import postgres from 'postgres';
import { config } from '../config';
import { logger } from '../logger';

let _sql: ReturnType<typeof postgres> | null = null;

export function getDb(): ReturnType<typeof postgres> {
  if (!_sql) {
    _sql = postgres(config.DATABASE_URL, {
      max: config.DB_MAX_CONNECTIONS,
      idle_timeout: config.DB_IDLE_TIMEOUT,
      connect_timeout: 10,
      max_lifetime: 1800,
      ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : false,
      transform: postgres.camel,
      types: {
        numeric: {
          to: 0,
          from: [1700],
          serialize: (n: number) => String(n),
          parse: (s: string) => parseFloat(s),
        },
      },
      onnotice: (notice) => logger.debug({ event: 'db.notice', notice }),
    });
  }
  return _sql;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
  }
}
