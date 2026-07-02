import type { Sql, TransactionSql } from 'postgres';
import { withTransaction } from '../../db/transaction';
import type { Subscription, CreateSubscriptionInput, CancelOptions, TransitionContext, SubscriptionEvent, ChangePlanInput } from './subscription.types';
import * as queries from '../../db/queries/subscription.queries';
import * as planQueries from '../../db/queries/plan.queries';
import * as invoiceQueries from '../../db/queries/invoice.queries';
import * as auditQueries from '../../db/queries/audit-log.queries';
import { applyTransition } from './subscription.state-machine';
import { calculateProration } from '../proration/proration.service';
import { NotFoundError, ValidationError } from '../../errors';

function asSql(tx: TransactionSql): Sql {
  return tx as unknown as Sql;
}

export async function createSubscription(
  sql: Sql,
  tenantId: string,
  input: CreateSubscriptionInput,
): Promise<Subscription> {
  const now = new Date();
  const trialDays = input.trialDays ?? 0;
  const trialEnd = trialDays > 0 ? new Date(now.getTime() + trialDays * 86400000) : null;
  const periodEnd = trialEnd ?? new Date(now.getTime() + 30 * 86400000);

  return queries.insertSubscription(sql, tenantId, {
    customerId: input.customerId,
    planId: input.planId,
    currency: input.currency,
    status: trialDays > 0 ? 'trialing' : 'active',
    paymentMethodId: input.paymentMethodId ?? null,
    couponId: null,
    trialStart: trialDays > 0 ? now : null,
    trialEnd,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    metadata: input.metadata ?? {},
  });
}

export async function getSubscription(sql: Sql, tenantId: string, subscriptionId: string): Promise<Subscription> {
  const sub = await queries.findSubscriptionById(sql, tenantId, subscriptionId);
  if (!sub) throw new NotFoundError('Subscription', subscriptionId);
  return sub;
}

export async function transitionState(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  event: SubscriptionEvent,
  context: TransitionContext,
): Promise<Subscription> {
  return withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const subscription = await queries.findSubscriptionForUpdate(s, tenantId, subscriptionId);
    if (!subscription) throw new NotFoundError('Subscription', subscriptionId);

    const { nextState } = applyTransition(subscription.status, event);

    const updated = await queries.updateSubscriptionStatus(s, tenantId, subscriptionId, nextState);

    await auditQueries.insertAuditLog(s, {
      tenantId,
      resourceType: 'subscription',
      resourceId: subscriptionId,
      actorType: context.actorType,
      actorId: context.actorId,
      action: event.toLowerCase(),
      diff: { from: subscription.status, to: nextState },
    });

    return updated;
  });
}

export async function cancelSubscription(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  options: CancelOptions = {},
): Promise<Subscription> {
  return withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const subscription = await queries.findSubscriptionForUpdate(s, tenantId, subscriptionId);
    if (!subscription) throw new NotFoundError('Subscription', subscriptionId);

    if (options.cancelAtPeriodEnd) {
      const [updated] = await s<Subscription[]>`
        UPDATE subscriptions
        SET cancel_at_period_end = TRUE, updated_at = NOW()
        WHERE id = ${subscriptionId} AND tenant_id = ${tenantId}
        RETURNING *
      `;
      return updated!;
    }

    const { nextState } = applyTransition(subscription.status, 'CANCEL');

    const updated = await queries.updateSubscriptionStatus(s, tenantId, subscriptionId, nextState);

    return updated;
  });
}

export async function pauseSubscription(sql: Sql, tenantId: string, subscriptionId: string): Promise<Subscription> {
  return withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const subscription = await queries.findSubscriptionForUpdate(s, tenantId, subscriptionId);
    if (!subscription) throw new NotFoundError('Subscription', subscriptionId);

    const { nextState } = applyTransition(subscription.status, 'PAUSE');
    return queries.updateSubscriptionStatus(s, tenantId, subscriptionId, nextState);
  });
}

export async function resumeSubscription(sql: Sql, tenantId: string, subscriptionId: string): Promise<Subscription> {
  return withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const subscription = await queries.findSubscriptionForUpdate(s, tenantId, subscriptionId);
    if (!subscription) throw new NotFoundError('Subscription', subscriptionId);

    const { nextState } = applyTransition(subscription.status, 'RESUME');
    return queries.updateSubscriptionStatus(s, tenantId, subscriptionId, nextState);
  });
}

export async function changePlan(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  input: ChangePlanInput,
): Promise<Subscription> {
  return withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const subscription = await queries.findSubscriptionForUpdate(s, tenantId, subscriptionId);
    if (!subscription) throw new NotFoundError('Subscription', subscriptionId);

    const newPlan = await planQueries.findPlanById(s, tenantId, input.newPlanId);
    if (!newPlan) throw new NotFoundError('Plan', input.newPlanId);

    const oldPrice = newPlan.prices.find((p) => p.currency === subscription.currency);
    if (!oldPrice) {
      throw new ValidationError(`New plan does not support currency ${subscription.currency}`);
    }

    if (input.immediate) {
      const oldPlan = await planQueries.findPlanById(s, tenantId, subscription.planId);
      const oldPriceAmount = oldPlan?.prices.find((p) => p.currency === subscription.currency)?.amount ?? 0;

      const now = new Date();
      const proration = calculateProration(
        oldPriceAmount,
        oldPrice.amount,
        subscription.currentPeriodStart,
        now,
        subscription.currentPeriodEnd,
      );

      if (proration.netAmount > 0) {
        const prorationInvoice = await invoiceQueries.insertInvoice(s, tenantId, {
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          currency: subscription.currency,
          subtotal: proration.netAmount,
          discountAmount: 0,
          total: proration.netAmount,
          amountDue: proration.netAmount,
          periodStart: now,
          periodEnd: subscription.currentPeriodEnd,
          dueDate: subscription.currentPeriodEnd,
          idempotencyKey: `proration_${subscription.id}_${Math.floor(now.getTime() / 1000)}`,
        });

        await invoiceQueries.insertLineItem(s, prorationInvoice.id, {
          type: 'proration',
          description: `Plan change proration (${proration.daysRemaining} days remaining)`,
          quantity: 1,
          unitAmount: proration.netAmount,
          amount: proration.netAmount,
          periodStart: now,
          periodEnd: subscription.currentPeriodEnd,
        });
      } else if (proration.netAmount < 0) {
        const newBalance = (subscription.creditBalance ?? 0) + Math.abs(proration.netAmount);
        await queries.updateSubscriptionCreditBalance(s, tenantId, subscriptionId, newBalance);
      }
    }

    const updated = await queries.updateSubscriptionPlan(s, tenantId, subscriptionId, input.newPlanId);

    await auditQueries.insertAuditLog(s, {
      tenantId,
      resourceType: 'subscription',
      resourceId: subscriptionId,
      actorType: input.immediate ? 'system' : 'api',
      actorId: 'change-plan',
      action: 'change_plan',
      diff: { from: subscription.planId, to: input.newPlanId, immediate: input.immediate },
    });

    return updated;
  });
}

export async function listDueForBilling(sql: Sql, asOf: Date): Promise<Subscription[]> {
  return queries.findDueForBilling(sql, asOf);
}

export async function listSubscriptionsByCustomer(sql: Sql, tenantId: string, customerId: string): Promise<Subscription[]> {
  return queries.listSubscriptionsByCustomer(sql, tenantId, customerId);
}

export async function listSubscriptionsByTenant(sql: Sql, tenantId: string, status?: string, limit?: number, offset?: number): Promise<Subscription[]> {
  return queries.listSubscriptionsByTenant(sql, tenantId, status, limit ?? 20, offset ?? 0);
}
