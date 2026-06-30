import type { Sql } from 'postgres';
import type { UsageRecord, UsageAggregation } from '../../domain/usage/usage.types';

export async function insertUsageRecord(sql: Sql, subscriptionId: string, input: {
  idempotencyKey: string;
  quantity: number;
  periodStart: Date;
  periodEnd: Date;
  timestamp: Date;
}): Promise<UsageRecord> {
  const [row] = await sql<UsageRecord[]>`
    INSERT INTO subscription_metered_usage (subscription_id, idempotency_key, quantity, period_start, period_end)
    VALUES (${subscriptionId}, ${input.idempotencyKey}, ${input.quantity}, ${input.periodStart}, ${input.periodEnd})
    RETURNING *
  `;
  return row!;
}

export async function findUsageByIdempotencyKey(sql: Sql, subscriptionId: string, idempotencyKey: string): Promise<UsageRecord | null> {
  const [row] = await sql<UsageRecord[]>`
    SELECT * FROM subscription_metered_usage
    WHERE subscription_id = ${subscriptionId} AND idempotency_key = ${idempotencyKey}
    LIMIT 1
  `;
  return row ?? null;
}

export async function aggregateUsage(sql: Sql, subscriptionId: string, periodStart: Date, periodEnd: Date): Promise<UsageAggregation> {
  const [row] = await sql<UsageAggregation[]>`
    SELECT
      COALESCE(SUM(quantity), 0)::bigint AS total_units,
      ${periodStart} AS period_start,
      ${periodEnd} AS period_end
    FROM subscription_metered_usage
    WHERE subscription_id = ${subscriptionId}
      AND period_start >= ${periodStart}
      AND period_end <= ${periodEnd}
  `;
  return row!;
}

export async function deleteUsageForPeriod(sql: Sql, subscriptionId: string, periodStart: Date, periodEnd: Date): Promise<void> {
  await sql`
    DELETE FROM subscription_metered_usage
    WHERE subscription_id = ${subscriptionId}
      AND period_start >= ${periodStart}
      AND period_end <= ${periodEnd}
  `;
}
