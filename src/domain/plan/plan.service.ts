import type { Sql } from 'postgres';
import type { Plan, CreatePlanInput } from './plan.types';
import * as queries from '../../db/queries/plan.queries';
import { NotFoundError, ValidationError } from '../../errors';

export async function createPlan(sql: Sql, tenantId: string, input: CreatePlanInput): Promise<Plan> {
  if (!input.prices || input.prices.length === 0) {
    throw new ValidationError('Plan must have at least one price');
  }

  const plan = await queries.insertPlan(sql, tenantId, {
    name: input.name,
    description: input.description ?? '',
    billingType: input.billingType,
    interval: input.interval,
    intervalCount: input.intervalCount ?? 1,
    trialDays: input.trialDays ?? null,
  });

  const prices = [];
  for (const priceInput of input.prices) {
    const price = await queries.insertPlanCurrency(sql, plan.id, {
      currency: priceInput.currency,
      amount: priceInput.amount,
      unitAmount: priceInput.unitAmount ?? null,
    });
    prices.push(price);
  }

  return { ...plan, prices };
}

export async function getPlan(sql: Sql, tenantId: string, planId: string): Promise<Plan> {
  const plan = await queries.findPlanById(sql, tenantId, planId);
  if (!plan) throw new NotFoundError('Plan', planId);
  return plan;
}

export async function listPlans(sql: Sql, tenantId: string, filters?: { type?: string; archived?: boolean }): Promise<Plan[]> {
  return queries.findPlansByTenant(sql, tenantId, filters);
}

export async function archivePlan(sql: Sql, tenantId: string, planId: string): Promise<Plan> {
  await getPlan(sql, tenantId, planId);
  return queries.archivePlan(sql, tenantId, planId);
}

export async function updatePlan(sql: Sql, tenantId: string, planId: string, input: { name?: string; description?: string; prices?: { currency: string; amount: number; unitAmount?: number }[] }): Promise<Plan> {
  const existing = await getPlan(sql, tenantId, planId);

  const plan = await queries.updatePlan(sql, tenantId, planId, {
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
  });

  const prices = [...existing.prices];
  if (input.prices) {
    for (const p of input.prices) {
      const updated = await queries.upsertPlanCurrency(sql, planId, {
        currency: p.currency,
        amount: p.amount,
        unitAmount: p.unitAmount ?? null,
      });
      const idx = prices.findIndex((ep) => ep.currency === p.currency);
      if (idx >= 0) prices[idx] = updated;
      else prices.push(updated);
    }
  }

  return { ...plan, prices };
}
