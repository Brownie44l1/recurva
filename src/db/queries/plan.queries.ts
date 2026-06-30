import type { Sql } from 'postgres';
import type { Plan, PlanCurrency } from '../../domain/plan/plan.types';

export async function insertPlan(sql: Sql, tenantId: string, input: {
  name: string;
  description: string;
  billingType: string;
  interval: string;
  intervalCount: number;
  trialDays: number | null;
}): Promise<Plan> {
  const [row] = await sql<Plan[]>`
    INSERT INTO plans (tenant_id, name, description, billing_type, interval, interval_count, trial_days)
    VALUES (${tenantId}, ${input.name}, ${input.description}, ${input.billingType}, ${input.interval}, ${input.intervalCount}, ${input.trialDays})
    RETURNING id, tenant_id, name, description, billing_type, interval, interval_count, trial_days, is_active, created_at, updated_at
  `;
  return { ...row!, prices: [] };
}

export async function insertPlanCurrency(sql: Sql, planId: string, input: {
  currency: string;
  amount: number;
  unitAmount: number | null;
}): Promise<PlanCurrency> {
  const [row] = await sql<PlanCurrency[]>`
    INSERT INTO plan_currencies (plan_id, currency, amount, unit_amount)
    VALUES (${planId}, ${input.currency}, ${input.amount}, ${input.unitAmount ?? null})
    RETURNING *
  `;
  return row!;
}

export async function findPlanById(sql: Sql, tenantId: string, planId: string): Promise<(Plan & { prices: PlanCurrency[] }) | null> {
  const plan = await sql<Plan[]>`
    SELECT id, tenant_id, name, description, billing_type, interval, interval_count, trial_days, is_active, created_at, updated_at
    FROM plans
    WHERE id = ${planId} AND tenant_id = ${tenantId}
    LIMIT 1
  `;
  if (plan.length === 0) return null;

  const prices = await sql<PlanCurrency[]>`
    SELECT * FROM plan_currencies WHERE plan_id = ${planId}
  `;

  return { ...plan[0]!, prices };
}

export async function findPlansByTenant(sql: Sql, tenantId: string, filters?: {
  type?: string;
  archived?: boolean;
}): Promise<(Plan & { prices: PlanCurrency[] })[]> {
  const plans = await sql<Plan[]>`
    SELECT id, tenant_id, name, description, billing_type, interval, interval_count, trial_days, is_active, created_at, updated_at
    FROM plans
    WHERE tenant_id = ${tenantId}
      AND (${filters?.type ?? ''} = '' OR billing_type = ${filters?.type ?? ''})
      AND (${filters?.archived ?? false} = true OR is_active = TRUE)
    ORDER BY created_at DESC
  `;

  const result = [];
  for (const plan of plans) {
    const prices = await sql<PlanCurrency[]>`
      SELECT * FROM plan_currencies WHERE plan_id = ${plan.id}
    `;
    result.push({ ...plan, prices });
  }
  return result;
}

export async function archivePlan(sql: Sql, tenantId: string, planId: string): Promise<Plan> {
  const [row] = await sql<Plan[]>`
    UPDATE plans SET is_active = FALSE, updated_at = NOW()
    WHERE id = ${planId} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return row!;
}

export async function updatePlan(sql: Sql, tenantId: string, planId: string, input: {
  name?: string;
  description?: string;
}): Promise<Plan> {
  const [row] = await sql<Plan[]>`
    UPDATE plans SET
      name = COALESCE(${input.name ?? null}, name),
      description = COALESCE(${input.description ?? null}, description),
      updated_at = NOW()
    WHERE id = ${planId} AND tenant_id = ${tenantId}
    RETURNING id, tenant_id, name, description, billing_type, interval, interval_count, trial_days, is_active, created_at, updated_at
  `;
  return row!;
}

export async function upsertPlanCurrency(sql: Sql, planId: string, input: {
  currency: string;
  amount: number;
  unitAmount: number | null;
}): Promise<PlanCurrency> {
  const [row] = await sql<PlanCurrency[]>`
    INSERT INTO plan_currencies (plan_id, currency, amount, unit_amount)
    VALUES (${planId}, ${input.currency}, ${input.amount}, ${input.unitAmount ?? null})
    ON CONFLICT (plan_id, currency)
    DO UPDATE SET amount = EXCLUDED.amount, unit_amount = EXCLUDED.unit_amount
    RETURNING *
  `;
  return row!;
}
