import type { Sql, TransactionSql } from 'postgres';

export async function withTransaction<T>(
  sql: Sql,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  if (typeof sql.begin === 'function') {
    return sql.begin(fn) as Promise<T>;
  }
  return fn(sql as unknown as TransactionSql);
}
