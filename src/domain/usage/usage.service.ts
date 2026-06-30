import type { Sql } from 'postgres';
import type { UsageRecord, ReportUsageInput, UsageAggregation } from './usage.types';
import * as queries from '../../db/queries/usage.queries';
import { NotFoundError, ValidationError } from '../../errors';
import * as subQueries from '../../db/queries/subscription.queries';
import * as planQueries from '../../db/queries/plan.queries';

export async function reportUsage(sql: Sql, tenantId: string, input: ReportUsageInput): Promise<UsageRecord> {
  const sub = await subQueries.findSubscriptionById(sql, tenantId, input.subscriptionId);
  if (!sub) throw new NotFoundError('Subscription', input.subscriptionId);

  const plan = await planQueries.findPlanById(sql, tenantId, sub.planId);
  if (!plan || plan.billingType === 'fixed') {
    throw new ValidationError('Usage reporting is only supported for metered or mixed plans');
  }

  const existing = await queries.findUsageByIdempotencyKey(sql, input.subscriptionId, input.idempotencyKey);
  if (existing) return existing;

  return queries.insertUsageRecord(sql, input.subscriptionId, {
    idempotencyKey: input.idempotencyKey,
    quantity: input.quantity,
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    timestamp: input.timestamp,
  });
}

export async function aggregateUsage(sql: Sql, subscriptionId: string, periodStart: Date, periodEnd: Date): Promise<UsageAggregation> {
  return queries.aggregateUsage(sql, subscriptionId, periodStart, periodEnd);
}

export async function getUsageSummary(sql: Sql, tenantId: string, subscriptionId: string) {
  const sub = await subQueries.findSubscriptionById(sql, tenantId, subscriptionId);
  if (!sub) throw new NotFoundError('Subscription', subscriptionId);

  const currentAgg = await queries.aggregateUsage(sql, subscriptionId, sub.currentPeriodStart, sub.currentPeriodEnd);

  const periodLength = sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime();
  const prevPeriodStart = new Date(sub.currentPeriodStart.getTime() - periodLength);
  const prevAgg = await queries.aggregateUsage(sql, subscriptionId, prevPeriodStart, sub.currentPeriodStart);

  return {
    currentPeriod: {
      start: sub.currentPeriodStart,
      end: sub.currentPeriodEnd,
      quantity: currentAgg.totalUnits,
    },
    previousPeriod: prevAgg.totalUnits > 0
      ? { start: prevPeriodStart, end: sub.currentPeriodStart, quantity: prevAgg.totalUnits }
      : null,
  };
}
