import type { Sql } from 'postgres';
import { logger } from '../logger';
import * as dunningQueries from '../db/queries/dunning.queries';
import * as invoiceQueries from '../db/queries/invoice.queries';
import * as paymentMethodQueries from '../db/queries/payment-method.queries';
import * as subscriptionQueries from '../db/queries/subscription.queries';
import { evaluatePolicy } from '../domain/dunning/dunning.service';
import { transitionState } from '../domain/subscription/subscription.service';

export async function executeDunningRetries(sql: Sql): Promise<void> {
  const now = new Date();
  const attempts = await dunningQueries.findScheduledDunningAttempts(sql, now, 50);

  for (const attempt of attempts) {
    try {
      const subs = await sql<{ tenant_id: string; customer_id: string; payment_method_id: string | null; status: string }[]>`
        SELECT tenant_id, customer_id, payment_method_id, status FROM subscriptions WHERE id = ${attempt.subscriptionId} LIMIT 1
      `;
      const sub = subs[0];
      if (!sub) {
        await dunningQueries.updateDunningAttempt(sql, attempt.id, { status: 'failed' });
        continue;
      }

      const invoice = await invoiceQueries.findInvoiceById(sql, sub.tenant_id, attempt.invoiceId);
      if (!invoice || invoice.status !== 'open') {
        await dunningQueries.updateDunningAttempt(sql, attempt.id, { status: 'failed' });
        await dunningQueries.cancelScheduledDunning(sql, attempt.subscriptionId);
        continue;
      }

      let paymentMethodId: string | null = sub.payment_method_id;
      if (!paymentMethodId) {
        const primary = await paymentMethodQueries.findPrimaryPaymentMethod(sql, sub.tenant_id, sub.customer_id);
        if (primary) paymentMethodId = primary.id;
      }

      if (!paymentMethodId) {
        await dunningQueries.updateDunningAttempt(sql, attempt.id, { status: 'failed' });
        continue;
      }

      const charge = await invoiceQueries.insertCharge(sql, sub.tenant_id, {
        customerId: sub.customer_id,
        invoiceId: attempt.invoiceId,
        paymentMethodId,
        currency: invoice.currency,
        amount: invoice.amountDue,
      });

      await invoiceQueries.updateChargeStatus(sql, charge.id, 'succeeded', {
        nombaChargeId: `dunning_${charge.id}`,
      });

      await dunningQueries.updateDunningAttempt(sql, attempt.id, {
        status: 'succeeded',
        chargeId: charge.id,
        executedAt: new Date(),
      });

      await invoiceQueries.updateInvoiceStatus(sql, attempt.invoiceId, 'paid');

      if (sub.status === 'past_due') {
        await transitionState(sql, sub.tenant_id, attempt.subscriptionId, 'PAYMENT_SUCCESS', {
          actorType: 'system',
          actorId: 'dunning-executor',
        });
      }

      await dunningQueries.cancelScheduledDunning(sql, attempt.subscriptionId);

      logger.info(
        { attemptId: attempt.id, subscriptionId: attempt.subscriptionId, invoiceId: attempt.invoiceId },
        'Dunning retry succeeded',
      );
    } catch (err) {
      logger.error({ attemptId: attempt.id, err }, 'Dunning retry failed');

      try {
        await dunningQueries.updateDunningAttempt(sql, attempt.id, { status: 'failed' });
      } catch { /* ignore */ }
    }
  }
}
