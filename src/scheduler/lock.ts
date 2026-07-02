import type { Sql } from 'postgres';

export async function tryAcquireLock(sql: Sql, lockKey: number): Promise<boolean> {
  const [row] = await sql<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${lockKey}) AS acquired
  `;
  return row!.acquired;
}

export async function releaseLock(sql: Sql, lockKey: number): Promise<void> {
  await sql`SELECT pg_advisory_unlock(${lockKey})`;
}
