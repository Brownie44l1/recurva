import type { Sql } from 'postgres';

export interface IdempotencyCacheRow {
  idempotency_key: string;
  response_status: number;
  response_body: unknown;
  created_at: Date;
}

export async function findIdempotencyCache(sql: Sql, key: string): Promise<IdempotencyCacheRow | null> {
  const [row] = await sql<any[]>`
    SELECT idempotency_key, response_status, response_body, created_at
    FROM idempotency_cache
    WHERE idempotency_key = ${key}
      AND created_at > NOW() - INTERVAL '24 hours'
    LIMIT 1
  `;
  if (!row) return null;
  return {
    idempotency_key: row.idempotency_key,
    response_status: row.response_status,
    response_body: row.response_body,
    created_at: row.created_at,
  };
}

export async function insertIdempotencyCache(sql: Sql, key: string, status: number, body: any): Promise<void> {
  await sql`
    INSERT INTO idempotency_cache (idempotency_key, response_status, response_body)
    VALUES (${key}, ${status}, ${sql.json(body)})
    ON CONFLICT (idempotency_key) DO NOTHING
  `;
}

export async function deleteExpiredIdempotencyCache(sql: Sql): Promise<void> {
  await sql`
    DELETE FROM idempotency_cache WHERE created_at < NOW() - INTERVAL '24 hours'
  `;
}
