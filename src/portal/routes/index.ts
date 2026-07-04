import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { issuePortalSession, verifyPortalToken } from '../../domain/portal/portal.service';
import type { PortalClaims } from '../../domain/portal/portal.types';
import { pauseSubscription, resumeSubscription, changePlan, getSubscription } from '../../domain/subscription/subscription.service';
import { executeSideEffects } from '../../domain/subscription/side-effect.dispatcher';
import { config } from '../../config';
import { logger } from '../../logger';
import jwt from 'jsonwebtoken';

declare module 'hono' {
  interface ContextVariableMap {
    portal: PortalClaims;
  }
}

const router = new Hono();

const requestSchema = z.object({ customerId: z.string().uuid(), tenantId: z.string().uuid() });

router.post('/auth/request', zValidator('json', requestSchema), async (c) => {
  const sql = getDb();
  const { customerId, tenantId } = c.req.valid('json');

  const [customer] = await sql<{ id: string; email: string }[]>`
    SELECT id, email FROM customers WHERE id = ${customerId} AND tenant_id = ${tenantId} LIMIT 1
  `;
  if (!customer) return c.json({ error: 'customer_not_found' }, 404);

  const magicToken = jwt.sign(
    { tenantId, customerId, email: customer.email, purpose: 'magic_link', exp: Math.floor(Date.now() / 1000) + 900 },
    config.JWT_SECRET,
  );

  logger.info({ customerId, email: customer.email }, 'Portal magic link generated');

  return c.json({ status: 'sent', magicToken });
});

router.get('/auth/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'missing_token' }, 400);

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { tenantId: string; customerId: string; email: string; purpose?: string };
    if (decoded.purpose !== 'magic_link') return c.json({ error: 'invalid_token' }, 401);

    const session = await issuePortalSession(decoded.tenantId, decoded.customerId, decoded.email);
    return c.json({ session });
  } catch {
    return c.json({ error: 'invalid_or_expired_token' }, 401);
  }
});

const portalAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401);
  try {
    const claims = await verifyPortalToken(authHeader.slice(7));
    c.set('portal', claims);
    await next();
  } catch {
    return c.json({ error: 'invalid_token' }, 401);
  }
});

router.get('/subscriptions', portalAuth, async (c) => {
  const sql = getDb();
  const { tenantId, customerId } = c.var.portal;
  const subs = await sql`
    SELECT s.*, p.name AS plan_name FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.tenant_id = ${tenantId} AND s.customer_id = ${customerId}
    ORDER BY s.created_at DESC
  `;
  return c.json({ subscriptions: subs });
});

router.get('/invoices', portalAuth, async (c) => {
  const sql = getDb();
  const { tenantId, customerId } = c.var.portal;
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');
  const invoices = await sql`
    SELECT * FROM invoices WHERE tenant_id = ${tenantId} AND customer_id = ${customerId}
    ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
  `;
  return c.json({ invoices });
});

router.get('/invoices/:id/download', portalAuth, async (c) => {
  const sql = getDb();
  const { tenantId, customerId } = c.var.portal;
  const invoice = await sql`
    SELECT * FROM invoices WHERE id = ${c.req.param('id')} AND tenant_id = ${tenantId} AND customer_id = ${customerId} LIMIT 1
  `;
  if (invoice.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ invoice: invoice[0] });
});

router.post('/subscriptions/:id/cancel', portalAuth, async (c) => {
  const sql = getDb();
  const { tenantId, customerId } = c.var.portal;
  const [sub] = await sql`
    SELECT * FROM subscriptions WHERE id = ${c.req.param('id')} AND tenant_id = ${tenantId} AND customer_id = ${customerId} LIMIT 1
  `;
  if (!sub) return c.json({ error: 'not_found' }, 404);
  await sql`
    UPDATE subscriptions SET cancel_at_period_end = TRUE, updated_at = NOW() WHERE id = ${sub.id}
  `;
  return c.json({ status: 'scheduled_for_cancellation' });
});

router.post('/subscriptions/:id/pause', portalAuth, async (c) => {
  const sql = getDb();
  const { tenantId, customerId } = c.var.portal;
  const sub = await getSubscription(sql, tenantId, c.req.param('id'));
  if (sub.customerId !== customerId) return c.json({ error: 'not_found' }, 404);
  const { subscription, sideEffects } = await pauseSubscription(sql, tenantId, sub.id);
  await executeSideEffects(sql, tenantId, subscription, sideEffects, { actorType: 'portal', actorId: customerId });
  return c.json({ status: 'paused', subscription });
});

router.post('/subscriptions/:id/resume', portalAuth, async (c) => {
  const sql = getDb();
  const { tenantId, customerId } = c.var.portal;
  const sub = await getSubscription(sql, tenantId, c.req.param('id'));
  if (sub.customerId !== customerId) return c.json({ error: 'not_found' }, 404);
  const { subscription, sideEffects } = await resumeSubscription(sql, tenantId, sub.id);
  await executeSideEffects(sql, tenantId, subscription, sideEffects, { actorType: 'portal', actorId: customerId });
  return c.json({ status: 'resumed', subscription });
});

router.post('/subscriptions/:id/change-plan', zValidator('json', z.object({ newPlanId: z.string().uuid() })), portalAuth, async (c) => {
  const sql = getDb();
  const { tenantId, customerId } = c.var.portal;
  const { newPlanId } = c.req.valid('json');
  const sub = await getSubscription(sql, tenantId, c.req.param('id'));
  if (sub.customerId !== customerId) return c.json({ error: 'not_found' }, 404);
  const updated = await changePlan(sql, tenantId, sub.id, { newPlanId, immediate: true });
  return c.json({ status: 'plan_changed', subscription: updated });
});

export { router as portalRoutes };
