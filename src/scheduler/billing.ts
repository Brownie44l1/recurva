import type { Sql } from 'postgres';
import { logger } from '../logger';
import { findDueForBilling, updateSubscriptionPeriod } from '../db/queries/subscription.queries';
import * as billingRunQueries from '../db/queries/billing-run.queries';
import { billSubscription } from '../domain/billing/billing.service';

const BATCH_SIZE = 50;
const ADVISORY_LOCK_ID = 0x52454355525641;

export async function acquireBillingLock(sql: Sql): Promise<boolean> {
  const [row] = await sql<{ lock_acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS lock_acquired
  `;
  return row!.lock_acquired;
}

export async function releaseBillingLock(sql: Sql): Promise<void> {
  await sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`;
}

export async function runBillingCycle(sql: Sql): Promise<{
  processed: number;
  failed: number;
  invoicesCreated: number;
  chargesSucceeded: number;
  chargesFailed: number;
}> {
  const lockAcquired = await acquireBillingLock(sql);
  if (!lockAcquired) {
    logger.info('Billing lock not acquired — another instance is processing');
    return { processed: 0, failed: 0, invoicesCreated: 0, chargesSucceeded: 0, chargesFailed: 0 };
  }

  const run = await billingRunQueries.insertBillingRun(sql);

  const result = { processed: 0, failed: 0, invoicesCreated: 0, chargesSucceeded: 0, chargesFailed: 0 };

  try {
    const now = new Date();
    let hasMore = true;

    while (hasMore) {
      const due = await findDueForBilling(sql, now, BATCH_SIZE);

      if (due.length === 0) {
        hasMore = false;
        break;
      }

      for (const subscription of due) {
        try {
          const billingResult = await billSubscription(
            sql,
            subscription.tenantId,
            subscription.id,
            { actorType: 'system', actorId: 'billing-scheduler' },
          );

          if (billingResult.success) {
            result.processed++;
            result.chargesSucceeded++;
            result.invoicesCreated++;
          } else {
            result.failed++;
          }
        } catch (err) {
          result.failed++;
          logger.error(
            { subscriptionId: subscription.id, tenantId: subscription.tenantId, err },
            'Billing cycle failed for subscription',
          );
        }
      }

      if (due.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    await billingRunQueries.finalizeBillingRun(sql, run.id, {
      subscriptionsProcessed: result.processed,
      subscriptionsFailed: result.failed,
      invoicesCreated: result.invoicesCreated,
      chargesSucceeded: result.chargesSucceeded,
      chargesFailed: result.chargesFailed,
    });

    logger.info(result, 'Billing cycle completed');
  } catch (err) {
    await billingRunQueries.finalizeBillingRun(sql, run.id, {
      subscriptionsProcessed: result.processed,
      subscriptionsFailed: result.failed,
      invoicesCreated: result.invoicesCreated,
      chargesSucceeded: result.chargesSucceeded,
      chargesFailed: result.chargesFailed,
      errorMessage: (err as Error).message,
    });
    logger.error({ err }, 'Billing cycle failed');
  } finally {
    await releaseBillingLock(sql);
  }

  return result;
}
