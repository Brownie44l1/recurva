import type { Sql } from 'postgres';
import type { DunningPolicy, DunningAttempt } from '../../domain/dunning/dunning.types';

export async function insertDunningPolicy(sql: Sql, tenantId: string, input: {
  name: string;
  retrySchedule: unknown[];
  finalAction: string;
  isDefault: boolean;
}): Promise<DunningPolicy> {
  const [row] = await sql<DunningPolicy[]>`
    INSERT INTO dunning_policies (tenant_id, name, retry_schedule, final_action, is_default)
    VALUES (${tenantId}, ${input.name}, ${sql.json(input.retrySchedule as any)}, ${input.finalAction}, ${input.isDefault})
    RETURNING *
  `;
  return row!;
}

export async function findDefaultDunningPolicy(sql: Sql, tenantId: string): Promise<DunningPolicy | null> {
  const [row] = await sql<DunningPolicy[]>`
    SELECT * FROM dunning_policies WHERE tenant_id = ${tenantId} AND is_default = TRUE LIMIT 1
  `;
  return row ?? null;
}

export async function findDunningPolicyById(sql: Sql, policyId: string): Promise<DunningPolicy | null> {
  const [row] = await sql<DunningPolicy[]>`
    SELECT * FROM dunning_policies WHERE id = ${policyId} LIMIT 1
  `;
  return row ?? null;
}

export async function insertDunningAttempt(sql: Sql, input: {
  subscriptionId: string;
  invoiceId: string;
  attemptNumber: number;
  scheduledAt: Date;
}): Promise<DunningAttempt> {
  const [row] = await sql<DunningAttempt[]>`
    INSERT INTO dunning_attempts (subscription_id, invoice_id, attempt_number, scheduled_at)
    VALUES (${input.subscriptionId}, ${input.invoiceId}, ${input.attemptNumber}, ${input.scheduledAt})
    RETURNING *
  `;
  return row!;
}

export async function findScheduledDunningAttempts(sql: Sql, asOf: Date, limit: number = 50): Promise<DunningAttempt[]> {
  return sql<DunningAttempt[]>`
    SELECT * FROM dunning_attempts
    WHERE status = 'scheduled' AND scheduled_at <= ${asOf}
    ORDER BY scheduled_at ASC
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  `;
}

export async function findDunningAttemptsBySubscription(sql: Sql, subscriptionId: string): Promise<DunningAttempt[]> {
  return sql<DunningAttempt[]>`
    SELECT * FROM dunning_attempts
    WHERE subscription_id = ${subscriptionId}
    ORDER BY attempt_number ASC
  `;
}

export async function updateDunningAttempt(sql: Sql, attemptId: string, updates: {
  status: string;
  chargeId?: string | null;
  executedAt?: Date;
  usedBackupCard?: boolean;
}): Promise<DunningAttempt> {
  const [row] = await sql<DunningAttempt[]>`
    UPDATE dunning_attempts SET
      status = ${updates.status},
      charge_id = COALESCE(${updates.chargeId ?? null}, charge_id),
      executed_at = COALESCE(${updates.executedAt ?? null}, executed_at),
      used_backup_card = COALESCE(${updates.usedBackupCard ?? false}, used_backup_card)
    WHERE id = ${attemptId}
    RETURNING *
  `;
  return row!;
}

export async function cancelScheduledDunning(sql: Sql, subscriptionId: string): Promise<void> {
  await sql`
    UPDATE dunning_attempts SET status = 'skipped'
    WHERE subscription_id = ${subscriptionId} AND status = 'scheduled'
  `;
}
