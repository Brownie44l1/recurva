import type { Sql, TransactionSql } from 'postgres';

export async function withTransaction<T>(
  sql: Sql,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(fn) as Promise<T>;
}
