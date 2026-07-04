import type { Sql } from 'postgres';
import { logger } from '../logger';
import { reportBillingError } from '../observability/report-error';
import * as dunningQueries from '../db/queries/dunning.queries';
import * as invoiceQueries from '../db/queries/invoice.queries';
import * as subscriptionQueries from '../db/queries/subscription.queries';
import { retryCharge } from '../domain/billing/billing.service';
import { evaluatePolicy } from '../domain/dunning/dunning.service';
import { transitionState } from '../domain/subscription/subscription.service';

export async function executeDunningRetries(sql: Sql): Promise<void> {
  const now = new Date();
  const attempts = await dunningQueries.findScheduledDunningAttempts(sql, now, 50);

  for (const attempt of attempts) {
    try {
      const invoice = await invoiceQueries.findOpenInvoiceForSubscription(sql, attempt.subscriptionId);
      if (!invoice) {
        await dunningQueries.updateDunningAttempt(sql, attempt.id, { status: 'skipped' });
        continue;
      }

      const sub = await subscriptionQueries.findSubscriptionForUpdate(sql, invoice.tenantId, attempt.subscriptionId);
      if (!sub) {
        await dunningQueries.updateDunningAttempt(sql, attempt.id, { status: 'skipped' });
        continue;
      }

      const result = await retryCharge(sql, invoice.tenantId, invoice.id);

      await dunningQueries.updateDunningAttempt(sql, attempt.id, {
        status: result.success ? 'succeeded' : 'failed',
        chargeId: result.chargeId ?? undefined,
        executedAt: new Date(),
        usedBackupCard: result.usedBackupCard ?? false,
      });

      if (!result.success) {
        const decision = await evaluatePolicy(sql, invoice.tenantId, attempt.subscriptionId);
        if (decision === 'cancel') {
          await transitionState(sql, invoice.tenantId, attempt.subscriptionId, 'CANCEL', {
            actorType: 'system',
            actorId: 'dunning-executor',
          });
        } else if (decision === 'mark_unpaid') {
          await transitionState(sql, invoice.tenantId, attempt.subscriptionId, 'MAX_DUNNING_REACHED', {
            actorType: 'system',
            actorId: 'dunning-executor',
          });
        }
      } else {
        if (sub.status === 'past_due') {
          await transitionState(sql, invoice.tenantId, attempt.subscriptionId, 'PAYMENT_SUCCESS', {
            actorType: 'system',
            actorId: 'dunning-executor',
          });
        }
        await dunningQueries.cancelScheduledDunning(sql, attempt.subscriptionId);
      }

      logger.info(
        { attemptId: attempt.id, subscriptionId: attempt.subscriptionId, invoiceId: invoice.id, success: result.success },
        'Dunning retry processed',
      );
    } catch (err) {
      reportBillingError(
        { attemptId: attempt.id, subscriptionId: attempt.subscriptionId, invoiceId: attempt.invoiceId },
        'Dunning retry failed',
        err,
      );
      try {
        await dunningQueries.updateDunningAttempt(sql, attempt.id, { status: 'failed' });
      } catch { /* ignore */ }
    }
  }
}
