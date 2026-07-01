import type { Sql } from 'postgres';

export interface BillingRun {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  lockAcquired: boolean;
  subscriptionsProcessed: number;
  subscriptionsFailed: number;
  invoicesCreated: number;
  chargesSucceeded: number;
  chargesFailed: number;
  errorMessage: string | null;
  createdAt: Date;
}

export async function insertBillingRun(sql: Sql): Promise<BillingRun> {
  const [row] = await sql<BillingRun[]>`
    INSERT INTO billing_runs (lock_acquired) VALUES (TRUE) RETURNING *
  `;
  return row!;
}

export async function finalizeBillingRun(sql: Sql, id: string, updates: {
  subscriptionsProcessed: number;
  subscriptionsFailed: number;
  invoicesCreated: number;
  chargesSucceeded: number;
  chargesFailed: number;
  errorMessage?: string | null;
}): Promise<BillingRun> {
  const [row] = await sql<BillingRun[]>`
    UPDATE billing_runs SET
      ended_at = NOW(),
      subscriptions_processed = ${updates.subscriptionsProcessed},
      subscriptions_failed = ${updates.subscriptionsFailed},
      invoices_created = ${updates.invoicesCreated},
      charges_succeeded = ${updates.chargesSucceeded},
      charges_failed = ${updates.chargesFailed},
      error_message = ${updates.errorMessage ?? null}
    WHERE id = ${id}
    RETURNING *
  `;
  return row!;
}
