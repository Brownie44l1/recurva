import type { Sql } from 'postgres';
import type { Subscription, SubscriptionStatus } from '../../domain/subscription/subscription.types';

export async function insertSubscription(sql: Sql, tenantId: string, input: {
  customerId: string;
  planId: string;
  currency: string;
  status: SubscriptionStatus;
  paymentMethodId?: string | null;
  couponId?: string | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  metadata?: Record<string, unknown>;
}): Promise<Subscription> {
  const [row] = await sql<Subscription[]>`
    INSERT INTO subscriptions (
      tenant_id, customer_id, plan_id, currency, status,
      payment_method_id, coupon_id, trial_start, trial_end,
      current_period_start, current_period_end, metadata
    ) VALUES (
      ${tenantId}, ${input.customerId}, ${input.planId}, ${input.currency}, ${input.status},
      ${input.paymentMethodId ?? null}, ${input.couponId ?? null},
      ${input.trialStart ?? null}, ${input.trialEnd ?? null},
      ${input.currentPeriodStart}, ${input.currentPeriodEnd},
      ${sql.json(input.metadata ?? {} as any)}
    )
    RETURNING *
  `;
  return row!;
}

export async function findSubscriptionById(sql: Sql, tenantId: string, subscriptionId: string): Promise<Subscription | null> {
  const [row] = await sql<Subscription[]>`
    SELECT * FROM subscriptions
    WHERE tenant_id = ${tenantId} AND id = ${subscriptionId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function findSubscriptionForUpdate(sql: Sql, tenantId: string, subscriptionId: string): Promise<Subscription | null> {
  const [row] = await sql<Subscription[]>`
    SELECT * FROM subscriptions
    WHERE tenant_id = ${tenantId} AND id = ${subscriptionId}
    FOR UPDATE
    LIMIT 1
  `;
  return row ?? null;
}

export async function findDueForBilling(sql: Sql, asOf: Date, limit: number = 100): Promise<Subscription[]> {
  return sql<Subscription[]>`
    SELECT s.*
    FROM subscriptions s
    WHERE s.status IN ('active', 'trialing', 'past_due')
      AND s.current_period_end <= ${asOf}
      AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.subscription_id = s.id
          AND i.status IN ('draft', 'open', 'paid')
          AND i.period_end = s.current_period_end
      )
    ORDER BY s.current_period_end ASC
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  `;
}

export async function updateSubscriptionStatus(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  status: SubscriptionStatus,
): Promise<Subscription> {
  const [row] = await sql<Subscription[]>`
    UPDATE subscriptions
    SET status = ${status}, updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND id = ${subscriptionId}
    RETURNING *
  `;
  return row!;
}

export async function updateSubscriptionPeriod(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<Subscription> {
  const [row] = await sql<Subscription[]>`
    UPDATE subscriptions
    SET current_period_start = ${periodStart}, current_period_end = ${periodEnd}, updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND id = ${subscriptionId}
    RETURNING *
  `;
  return row!;
}

export async function listSubscriptionsByCustomer(sql: Sql, tenantId: string, customerId: string): Promise<Subscription[]> {
  return sql<Subscription[]>`
    SELECT * FROM subscriptions
    WHERE tenant_id = ${tenantId} AND customer_id = ${customerId}
    ORDER BY created_at DESC
  `;
}

export async function updateSubscriptionPaymentMethod(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  paymentMethodId: string,
): Promise<Subscription> {
  const [row] = await sql<Subscription[]>`
    UPDATE subscriptions
    SET payment_method_id = ${paymentMethodId}, updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND id = ${subscriptionId}
    RETURNING *
  `;
  return row!;
}

export async function restoreCreditBalance(
  sql: Sql,
  subscriptionId: string,
  amount: number,
): Promise<Subscription> {
  const [row] = await sql<Subscription[]>`
    UPDATE subscriptions
    SET credit_balance = credit_balance + ${amount}, updated_at = NOW()
    WHERE id = ${subscriptionId}
    RETURNING *
  `;
  return row!;
}

export async function decrementCreditBalance(
  sql: Sql,
  subscriptionId: string,
  amount: number,
): Promise<Subscription> {
  const [row] = await sql<Subscription[]>`
    UPDATE subscriptions
    SET credit_balance = GREATEST(credit_balance - ${amount}, 0), updated_at = NOW()
    WHERE id = ${subscriptionId}
    RETURNING *
  `;
  return row!;
}

export async function updateSubscriptionTrialEnd(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  trialEnd: Date,
): Promise<Subscription> {
  const [row] = await sql<Subscription[]>`
    UPDATE subscriptions
    SET trial_end = ${trialEnd}, updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND id = ${subscriptionId}
    RETURNING *
  `;
  return row!;
}

export async function updateSubscriptionPlan(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  planId: string,
): Promise<Subscription> {
  const [row] = await sql<Subscription[]>`
    UPDATE subscriptions
    SET plan_id = ${planId}, updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND id = ${subscriptionId}
    RETURNING *
  `;
  return row!;
}

export async function updateSubscriptionCreditBalance(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  creditBalance: number,
): Promise<Subscription> {
  const [row] = await sql<Subscription[]>`
    UPDATE subscriptions
    SET credit_balance = ${creditBalance}, updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND id = ${subscriptionId}
    RETURNING *
  `;
  return row!;
}

export async function listSubscriptionsByTenant(sql: Sql, tenantId: string, status?: string, limit: number = 20, offset: number = 0): Promise<Subscription[]> {
  return sql<Subscription[]>`
    SELECT * FROM subscriptions
    WHERE tenant_id = ${tenantId}
      AND (${status ?? ''} = '' OR status = ${status ?? ''})
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
