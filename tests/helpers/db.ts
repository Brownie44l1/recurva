import { getDb, closeDb } from '../../src/db/client';
import { config } from '../../src/config';

export async function setupTestDb() {
  const sql = getDb();
  return sql;
}

export async function teardownTestDb() {
  await closeDb();
}
