import type { Sql } from 'postgres';
import type { DunningPolicy, DunningAttempt, DunningAttemptResult, DunningPolicyDecision, RetryScheduleEntry } from './dunning.types';
import * as queries from '../../db/queries/dunning.queries';
import { NotFoundError } from '../../errors';

const DEFAULT_RETRY_SCHEDULE: RetryScheduleEntry[] = [
  { day: 0, useBackup: true },
  { day: 1 },
  { day: 3 },
  { day: 7 },
  { day: 10 },
];

export function adjustForSalaryCycle(date: Date): Date {
  const day = date.getDate();
  if (day >= 24 && day <= 27) {
    const adjusted = new Date(date);
    adjusted.setDate(28);
    adjusted.setHours(9, 0, 0, 0);
    if (adjusted <= date) {
      adjusted.setMonth(adjusted.getMonth() + 1);
    }
    return adjusted;
  }
  return date;
}

export async function initiateDunning(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  invoiceId: string,
): Promise<DunningAttempt[]> {
  let policy = await queries.findDefaultDunningPolicy(sql, tenantId);
  const schedule = policy?.retrySchedule as unknown as RetryScheduleEntry[] ?? DEFAULT_RETRY_SCHEDULE;
  const now = new Date();
  const attempts: DunningAttempt[] = [];

  for (const entry of schedule) {
    const scheduledAt = new Date(now.getTime() + entry.day * 86400000);
    const adjusted = adjustForSalaryCycle(scheduledAt);

    const attempt = await queries.insertDunningAttempt(sql, {
      subscriptionId,
      invoiceId,
      attemptNumber: entry.day + 1,
      scheduledAt: adjusted,
    });
    attempts.push(attempt);
  }

  return attempts;
}

export async function getNextRetryTime(sql: Sql, tenantId: string, subscriptionId: string): Promise<Date | null> {
  const attempts = await queries.findDunningAttemptsBySubscriptionForUpdate(sql, subscriptionId);
  const next = attempts.find((a) => a.status === 'scheduled');
  return next?.scheduledAt ?? null;
}

export async function recordAttempt(sql: Sql, tenantId: string, subscriptionId: string, result: DunningAttemptResult): Promise<void> {
  const attempts = await queries.findDunningAttemptsBySubscriptionForUpdate(sql, subscriptionId);
  const current = attempts.find((a) => a.status === 'scheduled');
  if (current) {
    await queries.updateDunningAttempt(sql, current.id, {
      status: result.success ? 'succeeded' : 'failed',
      chargeId: result.chargeId ?? null,
      executedAt: new Date(),
      usedBackupCard: result.usedBackupCard,
    });
  }
}

export async function evaluatePolicy(sql: Sql, tenantId: string, subscriptionId: string): Promise<DunningPolicyDecision> {
  const attempts = await queries.findDunningAttemptsBySubscriptionForUpdate(sql, subscriptionId);
  const failedAttempts = attempts.filter((a) => a.status === 'failed');
  const scheduled = attempts.filter((a) => a.status === 'scheduled');

  if (scheduled.length === 0 && failedAttempts.length > 0) {
    const policy = await queries.findDefaultDunningPolicy(sql, tenantId);
    return policy?.finalAction as DunningPolicyDecision ?? 'cancel';
  }

  return 'continue';
}

export async function detectSelfCure(sql: Sql, tenantId: string, subscriptionId: string): Promise<boolean> {
  const attempts = await queries.findDunningAttemptsBySubscriptionForUpdate(sql, subscriptionId);
  return attempts.some((a) => a.status === 'succeeded');
}
