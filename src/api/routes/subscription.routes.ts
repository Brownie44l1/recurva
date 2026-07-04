import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { createSubscription, getSubscription, cancelSubscription, pauseSubscription, resumeSubscription, changePlan, listSubscriptionsByTenant, listSubscriptionsByCustomer } from '../../domain/subscription/subscription.service';
import { executeSideEffects } from '../../domain/subscription/side-effect.dispatcher';
import * as queries from '../../db/queries/subscription.queries';
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
  const { subscription: sub, sideEffects } = await cancelSubscription(sql, tenant.id, c.req.param('id'), options);
  await executeSideEffects(sql, tenant.id, sub, sideEffects, { actorType: 'tenant', actorId: tenant.id });
  return c.json({ subscription: sub });
});

router.post('/:id/pause', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const { subscription: sub, sideEffects } = await pauseSubscription(sql, tenant.id, c.req.param('id'));
  await executeSideEffects(sql, tenant.id, sub, sideEffects, { actorType: 'tenant', actorId: tenant.id });
  return c.json({ subscription: sub });
});

router.post('/:id/resume', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const { subscription: sub, sideEffects } = await resumeSubscription(sql, tenant.id, c.req.param('id'));
  await executeSideEffects(sql, tenant.id, sub, sideEffects, { actorType: 'tenant', actorId: tenant.id });
  return c.json({ subscription: sub });
});

router.post('/:id/change-plan', zValidator('json', changePlanSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');
  const sub = await changePlan(sql, tenant.id, c.req.param('id'), input);
  return c.json({ subscription: sub });
});

const updatePaymentMethodSchema = z.object({
  paymentMethodId: z.string().uuid(),
});

router.post('/:id/payment-method', zValidator('json', updatePaymentMethodSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const { paymentMethodId } = c.req.valid('json');
  const sub = await queries.updateSubscriptionPaymentMethod(sql, tenant.id, c.req.param('id'), paymentMethodId);
  return c.json({ subscription: sub });
});

export { router as subscriptionRoutes };
