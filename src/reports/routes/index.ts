import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../../db/client';
import { config } from '../../config';
import jwt from 'jsonwebtoken';

const router = new Hono();

async function adminAuth(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401);
  try {
    const decoded = jwt.verify(authHeader.slice(7), config.JWT_SECRET) as { tenantId: string; role: string };
    if (decoded.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
    c.set('admin', decoded);
    await next();
  } catch {
    return c.json({ error: 'invalid_token' }, 401);
  }
}

const dateRange = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  currency: z.string().optional(),
});

const defaultFrom = () => new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
const defaultTo = () => new Date().toISOString().slice(0, 10);

router.get('/revenue', zValidator('query', z.object({
  from: z.string().optional().default(defaultFrom),
  to: z.string().optional().default(defaultTo),
  interval: z.enum(['daily', 'monthly']).optional().default('monthly'),
  currency: z.string().optional(),
})), adminAuth, async (c: any) => {
  const sql = getDb();
  const tenantId = c.var.admin.tenantId;
  const { from, to, interval, currency } = c.req.valid('query');

  const periodExpr = interval === 'daily'
    ? `to_char(paid_at, 'YYYY-MM-DD')`
    : `to_char(paid_at, 'YYYY-MM')`;

  const params: any[] = [tenantId, from, to];
  let currencyFilter = '';
  if (currency) {
    currencyFilter = 'AND i.currency = $4';
    params.push(currency);
  }

  const rows = await sql.unsafe(`
    SELECT ${periodExpr} AS period, i.currency, i.subscription_id, i.total, i.id AS invoice_id
    FROM invoices i
    WHERE i.tenant_id = $1 AND i.status = 'paid' AND i.paid_at >= $2::date AND i.paid_at <= $3::date + interval '1 day'
    ${currencyFilter}
    ORDER BY period ASC
  `, params);

  const grouped = new Map<string, { period: string; currency: string; amount: number; invoiceIds: Set<string> }>();
  for (const r of rows) {
    const key = `${r.period}|${r.currency}`;
    const existing = grouped.get(key) ?? { period: r.period, currency: r.currency, amount: 0, invoiceIds: new Set<string>() };
    existing.amount += Number(r.total);
    existing.invoiceIds.add(r.invoice_id);
    grouped.set(key, existing);
  }

  return c.json({
    revenue: Array.from(grouped.values()).map(g => ({
      period: g.period,
      currency: g.currency,
      amount: g.amount,
      invoiceCount: g.invoiceIds.size,
    })),
  });
});

router.get('/cohorts', zValidator('query', z.object({
  from: z.string().optional().default(() => new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)),
  to: z.string().optional().default(defaultTo),
})), adminAuth, async (c: any) => {
  const sql = getDb();
  const tenantId = c.var.admin.tenantId;
  const { from, to } = c.req.valid('query');

  const cohorts = await sql.unsafe(`
    WITH cohort_months AS (
      SELECT
        customer_id,
        to_char(MIN(created_at), 'YYYY-MM') AS cohort_month,
        MIN(created_at)::date AS first_sub_date
      FROM subscriptions
      WHERE tenant_id = $1 AND created_at <= $3::date + interval '1 day'
      GROUP BY customer_id
      HAVING MIN(created_at) >= $2::date
    ),
    months_series AS (
      SELECT generate_series(
        date_trunc('month', $2::date),
        date_trunc('month', $3::date),
        '1 month'::interval
      )::date AS month_start
    ),
    active_subs AS (
      SELECT s.customer_id, s.created_at,
        COALESCE(s.cancelled_at, $3::date + interval '1 day') AS cancelled_at
      FROM subscriptions s
      WHERE s.tenant_id = $1 AND s.status != 'incomplete'
    )
    SELECT
      cm.cohort_month,
      to_char(ms.month_start, 'YYYY-MM') AS period,
      COUNT(DISTINCT cm.customer_id) FILTER (
        WHERE ms.month_start >= date_trunc('month', cm.first_sub_date)
          AND ms.month_start < date_trunc('month', COALESCE(
            (SELECT MIN(s.cancelled_at) FROM active_subs s WHERE s.customer_id = cm.customer_id),
            $3::date + interval '1 day'
          ))
      )::int AS retained
    FROM cohort_months cm
    CROSS JOIN months_series ms
    GROUP BY cm.cohort_month, ms.month_start
    ORDER BY cm.cohort_month, ms.month_start
  `, [tenantId, from, to]);

  const cohortMap = new Map<string, { cohort: string; months: { period: string; retained: number }[] }>();
  for (const r of cohorts) {
    const entry = cohortMap.get(r.cohort_month) ?? { cohort: r.cohort_month, months: [] as { period: string; retained: number }[] };
    entry.months.push({ period: r.period, retained: r.retained });
    cohortMap.set(r.cohort_month, entry);
  }

  return c.json({
    cohorts: Array.from(cohortMap.values()).map(c => ({
      cohort: c.cohort,
      months: c.months.map(m => m.retained),
      periods: c.months.map(m => m.period),
    })),
  });
});

router.get('/clv', zValidator('query', z.object({
  from: z.string().optional().default(defaultFrom),
  to: z.string().optional().default(defaultTo),
})), adminAuth, async (c: any) => {
  const sql = getDb();
  const tenantId = c.var.admin.tenantId;
  const { from, to } = c.req.valid('query');

  const rows = await sql.unsafe(`
    SELECT p.id AS plan_id, p.name AS plan_name,
      COUNT(DISTINCT i.customer_id)::int AS customer_count,
      SUM(i.total)::bigint AS total_revenue,
      ROUND((SUM(i.total) / GREATEST(COUNT(DISTINCT i.customer_id), 1))::numeric, 2)::text AS avg_clv
    FROM invoices i
    JOIN subscriptions s ON s.id = i.subscription_id
    JOIN plans p ON p.id = s.plan_id
    WHERE i.tenant_id = $1 AND i.status = 'paid'
      AND i.paid_at >= $2::date AND i.paid_at <= $3::date + interval '1 day'
    GROUP BY p.id, p.name
    ORDER BY avg_clv DESC
  `, [tenantId, from, to]);

  return c.json({
    clv: rows.map(r => ({
      planId: r.plan_id,
      planName: r.plan_name,
      customerCount: r.customer_count,
      totalRevenue: Number(r.total_revenue),
      averageClv: parseFloat(r.avg_clv),
    })),
  });
});

router.get('/dunning', zValidator('query', z.object({
  from: z.string().optional().default(defaultFrom),
  to: z.string().optional().default(defaultTo),
})), adminAuth, async (c: any) => {
  const sql = getDb();
  const tenantId = c.var.admin.tenantId;
  const { from, to } = c.req.valid('query');

  const rows = await sql.unsafe(`
    SELECT
      to_char(da.created_at, 'YYYY-MM') AS month,
      COUNT(*)::int AS attempts,
      COUNT(*) FILTER (WHERE da.status = 'succeeded')::int AS recovered,
      COUNT(*) FILTER (WHERE da.status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE da.status = 'exhausted')::int AS exhausted,
      COALESCE(SUM(ch.amount) FILTER (WHERE da.status = 'succeeded'), 0)::bigint AS recovered_amount
    FROM dunning_attempts da
    JOIN subscriptions s ON s.id = da.subscription_id
    LEFT JOIN charges ch ON ch.id = da.charge_id
    WHERE s.tenant_id = $1 AND da.created_at >= $2::date AND da.created_at <= $3::date + interval '1 day'
    GROUP BY month
    ORDER BY month ASC
  `, [tenantId, from, to]);

  return c.json({ dunning: rows });
});

router.get('/reconciliation', zValidator('query', z.object({
  from: z.string().optional().default(defaultFrom),
  to: z.string().optional().default(defaultTo),
})), adminAuth, async (c: any) => {
  const sql = getDb();
  const tenantId = c.var.admin.tenantId;
  const { from, to } = c.req.valid('query');

  const paidNoCharge = await sql.unsafe(`
    SELECT i.id, i.subscription_id, i.total, i.paid_at, i.currency
    FROM invoices i
    WHERE i.tenant_id = $1 AND i.status = 'paid'
      AND NOT EXISTS (SELECT 1 FROM charges c WHERE c.invoice_id = i.id)
      AND i.paid_at >= $2::date AND i.paid_at <= $3::date + interval '1 day'
  `, [tenantId, from, to]);

  const openWithCharge = await sql.unsafe(`
    SELECT i.id, i.subscription_id, i.total, i.amount_paid, i.currency, c.id AS charge_id, c.status AS charge_status, c.amount AS charge_amount
    FROM invoices i
    JOIN charges c ON c.invoice_id = i.id
    WHERE i.tenant_id = $1 AND i.status = 'open'
      AND i.created_at >= $2::date AND i.created_at <= $3::date + interval '1 day'
  `, [tenantId, from, to]);

  return c.json({
    paidInvoicesWithoutCharge: paidNoCharge,
    openInvoicesWithCharge: openWithCharge,
  });
});

export { router as reportRoutes };
