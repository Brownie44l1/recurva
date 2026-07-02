import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../../db/client';
import { config } from '../../config';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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

router.post('/auth', zValidator('json', z.object({
  email: z.string().email(),
  password: z.string().min(1),
})), async (c) => {
  const sql = getDb();
  const { email, password } = c.req.valid('json');

  const rows = await sql<{ id: string; tenantId: string; email: string; passwordHash: string }[]>`
    SELECT * FROM tenant_admin_credentials WHERE email = ${email} LIMIT 1
  `;
  const admin = rows[0];
  if (!admin) return c.json({ error: 'invalid_credentials' }, 401);

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) return c.json({ error: 'invalid_credentials' }, 401);

  const token = jwt.sign(
    { tenantId: admin.tenantId, email: admin.email, role: 'admin', exp: Math.floor(Date.now() / 1000) + 86400 },
    config.JWT_SECRET,
  );

  return c.json({ token, tenantId: admin.tenantId });
});

router.get('/metrics', adminAuth, async (c: any) => {
  const sql = getDb();
  const tenantId = c.var.admin.tenantId;

  const counts = await sql<{ active: number; trialing: number; past_due: number; cancelled: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE status = 'trialing')::int AS trialing,
      COUNT(*) FILTER (WHERE status = 'past_due')::int AS past_due,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
    FROM subscriptions WHERE tenant_id = ${tenantId}
  `;
  const row = counts[0] ?? { active: 0, trialing: 0, past_due: 0, cancelled: 0 };

  const mrrRows = await sql<{ currency: string; mrr: number }[]>`
    SELECT s.currency,
      SUM(CASE WHEN p.interval = 'year' THEN pc.amount / 12 ELSE pc.amount END)::bigint AS mrr
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    JOIN plan_currencies pc ON pc.plan_id = s.plan_id AND pc.currency = s.currency
    WHERE s.tenant_id = ${tenantId} AND s.status = 'active'
    GROUP BY s.currency
  `;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const cancelledThisMonth = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM subscriptions
    WHERE tenant_id = ${tenantId} AND status = 'cancelled' AND updated_at >= ${monthStart}
  `;
  const activeAtMonthStart = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM subscriptions
    WHERE tenant_id = ${tenantId} AND status IN ('active', 'past_due', 'trialing') AND created_at < ${monthStart}
  `;

  const cancelledCount = cancelledThisMonth[0]?.count ?? 0;
  const activeStartCount = activeAtMonthStart[0]?.count ?? 0;
  const churnRate = activeStartCount > 0
    ? Math.round((cancelledCount / activeStartCount) * 10000) / 100
    : 0;

  return c.json({
    subscribers: row,
    mrr: mrrRows,
    churnRate,
  });
});

router.get('/dunning-metrics', adminAuth, async (c: any) => {
  const sql = getDb();
  const tenantId = c.var.admin.tenantId;

  const failedToday = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM dunning_attempts da
    JOIN subscriptions s ON s.id = da.subscription_id
    WHERE s.tenant_id = ${tenantId} AND da.status = 'failed' AND da.executed_at >= CURRENT_DATE
  `;

  const failedTotal = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM dunning_attempts da
    JOIN subscriptions s ON s.id = da.subscription_id
    WHERE s.tenant_id = ${tenantId} AND da.status = 'failed'
  `;

  const totalAttempts = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM dunning_attempts da
    JOIN subscriptions s ON s.id = da.subscription_id
    WHERE s.tenant_id = ${tenantId}
  `;

  const total = totalAttempts[0]?.count ?? 0;
  const failed = failedTotal[0]?.count ?? 0;
  const recoveryRate = total > 0
    ? Math.round(((total - failed) / total) * 10000) / 100
    : 0;

  const scheduled = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM dunning_attempts da
    JOIN subscriptions s ON s.id = da.subscription_id
    WHERE s.tenant_id = ${tenantId} AND da.status = 'scheduled'
  `;

  return c.json({
    failedToday: failedToday[0]?.count ?? 0,
    failedTotal: failed,
    recoveryRate,
    scheduledAttempts: scheduled[0]?.count ?? 0,
  });
});

export { router as dashboardRoutes };
