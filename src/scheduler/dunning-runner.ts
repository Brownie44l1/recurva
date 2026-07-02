import type { Sql } from 'postgres';
import { getDb } from '../db/client';
import * as dunningQueries from '../db/queries/dunning.queries';
import * as invoiceQueries from '../db/queries/invoice.queries';
import { retryCharge } from '../domain/billing/billing.service';
import { evaluatePolicy } from '../domain/dunning/dunning.service';
import { transitionState } from '../domain/subscription/subscription.service';
import { tryAcquireLock, releaseLock } from './lock';
import { config } from '../config';
import { logger } from '../logger';

const DUNNING_LOCK_KEY = 2001;

export async function runDunningCycle(): Promise<void> {
  const sql = getDb();

  const acquired = await tryAcquireLock(sql, DUNNING_LOCK_KEY);
  if (!acquired) {
    logger.info({ event: 'scheduler.dunning.skipped', reason: 'lock_held' });
    return;
  }

  const startedAt = Date.now();
  let processed = 0;
  let errors = 0;

  try {
    const now = new Date();
    const attempts = await dunningQueries.findScheduledDunningAttempts(sql, now);

    for (const attempt of attempts) {
      try {
        const invoice = await invoiceQueries.findOpenInvoiceForSubscription(sql, attempt.subscriptionId);
        if (!invoice) {
          await dunningQueries.updateDunningAttempt(sql, attempt.id, { status: 'skipped' });
          continue;
        }

        const result = await retryCharge(sql, invoice.tenantId, invoice.id);

        await dunningQueries.updateDunningAttempt(sql, attempt.id, {
          status: result.success ? 'succeeded' : 'failed',
          chargeId: result.chargeId ?? undefined,
          executedAt: new Date(),
          usedBackupCard: attempt.attemptNumber > 1,
        });

        if (!result.success) {
          const decision = await evaluatePolicy(sql, invoice.tenantId, attempt.subscriptionId);
          if (decision === 'cancel') {
            await transitionState(sql, invoice.tenantId, attempt.subscriptionId, 'CANCEL', {
              actorType: 'system',
              actorId: 'dunning-runner',
            });
          }
        }

        processed++;
      } catch (error) {
        errors++;
        logger.error({
          event: 'scheduler.dunning.attempt_failed',
          attemptId: attempt.id,
          subscriptionId: attempt.subscriptionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  } finally {
    await releaseLock(sql, DUNNING_LOCK_KEY);
    logger.info({
      event: 'scheduler.dunning.cycle_complete',
      processed,
      errors,
      durationMs: Date.now() - startedAt,
    });
  }
}

const INTERVAL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;

export function startDunningScheduler(): void {
  logger.info({ event: 'scheduler.dunning.started', cron: config.DUNNING_CRON });

  runDunningCycle();

  timer = setInterval(() => {
    runDunningCycle();
  }, INTERVAL_MS);
}

export function stopDunningScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
