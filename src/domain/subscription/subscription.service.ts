import type { Sql, TransactionSql } from 'postgres';
import { withTransaction } from '../../db/transaction';
import type { Subscription, CreateSubscriptionInput, CancelOptions, TransitionContext, SubscriptionEvent } from './subscription.types';
import type { SideEffect } from './subscription.state-machine';
import * as queries from '../../db/queries/subscription.queries';
import * as auditQueries from '../../db/queries/audit-log.queries';
import { applyTransition } from './subscription.state-machine';
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
): Promise<{ subscription: Subscription; sideEffects: SideEffect[] }> {
  return withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const subscription = await queries.findSubscriptionForUpdate(s, tenantId, subscriptionId);
    if (!subscription) throw new NotFoundError('Subscription', subscriptionId);

    const { nextState, sideEffects } = applyTransition(subscription.status, event);

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

    return { subscription: updated, sideEffects };
  });
}

export async function cancelSubscription(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  options: CancelOptions = {},
): Promise<{ subscription: Subscription; sideEffects: SideEffect[] }> {
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
      return { subscription: updated!, sideEffects: ['SCHEDULE_CANCELLATION'] as SideEffect[] };
    }

    const { nextState, sideEffects } = applyTransition(subscription.status, 'CANCEL');

    const updated = await queries.updateSubscriptionStatus(s, tenantId, subscriptionId, nextState);

    return { subscription: updated, sideEffects };
  });
}

export async function pauseSubscription(sql: Sql, tenantId: string, subscriptionId: string): Promise<{ subscription: Subscription; sideEffects: SideEffect[] }> {
  return withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const subscription = await queries.findSubscriptionForUpdate(s, tenantId, subscriptionId);
    if (!subscription) throw new NotFoundError('Subscription', subscriptionId);

    const { nextState, sideEffects } = applyTransition(subscription.status, 'PAUSE');
    const updated = await queries.updateSubscriptionStatus(s, tenantId, subscriptionId, nextState);
    return { subscription: updated, sideEffects };
  });
}

export async function resumeSubscription(sql: Sql, tenantId: string, subscriptionId: string): Promise<{ subscription: Subscription; sideEffects: SideEffect[] }> {
  return withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const subscription = await queries.findSubscriptionForUpdate(s, tenantId, subscriptionId);
    if (!subscription) throw new NotFoundError('Subscription', subscriptionId);

    const { nextState, sideEffects } = applyTransition(subscription.status, 'RESUME');
    const updated = await queries.updateSubscriptionStatus(s, tenantId, subscriptionId, nextState);
    return { subscription: updated, sideEffects };
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
