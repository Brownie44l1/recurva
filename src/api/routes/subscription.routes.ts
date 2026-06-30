import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { createSubscription, getSubscription, cancelSubscription, pauseSubscription, resumeSubscription, listSubscriptionsByTenant, listSubscriptionsByCustomer } from '../../domain/subscription/subscription.service';
import { createSubscriptionSchema, cancelSubscriptionSchema, changePlanSchema } from '../validators/subscription.validator';

const router = new Hono();

router.use('*', tenantAuthMiddleware);

router.post('/', zValidator('json', createSubscriptionSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');
  const sub = await createSubscription(sql, tenant.id, input);
  return c.json({ subscription: sub }, 201);
});

router.get('/', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');
  const subscriptions = await listSubscriptionsByTenant(sql, tenant.id, status, limit, offset);
  return c.json({ subscriptions });
});

router.get('/:id', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const sub = await getSubscription(sql, tenant.id, c.req.param('id'));
  return c.json({ subscription: sub });
});

router.get('/customer/:customerId', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const subscriptions = await listSubscriptionsByCustomer(sql, tenant.id, c.req.param('customerId'));
  return c.json({ subscriptions });
});

router.post('/:id/cancel', zValidator('json', cancelSubscriptionSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const options = c.req.valid('json');
  const sub = await cancelSubscription(sql, tenant.id, c.req.param('id'), options);
  return c.json({ subscription: sub });
});

router.post('/:id/pause', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const sub = await pauseSubscription(sql, tenant.id, c.req.param('id'));
  return c.json({ subscription: sub });
});

router.post('/:id/resume', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const sub = await resumeSubscription(sql, tenant.id, c.req.param('id'));
  return c.json({ subscription: sub });
});

router.post('/:id/change-plan', zValidator('json', changePlanSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const sub = await getSubscription(sql, tenant.id, c.req.param('id'));
  return c.json({ subscription: sub });
});

export { router as subscriptionRoutes };
