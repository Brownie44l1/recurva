import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { createSubscription } from '../../domain/subscription/subscription.service';
import { createCheckoutSession } from '../../domain/nomba/nomba.service';
import * as planQueries from '../../db/queries/plan.queries';
import * as customerQueries from '../../db/queries/customer.queries';
import * as pendingCheckoutQueries from '../../db/queries/pending-checkout.queries';
import { config } from '../../config';

const router = new Hono();

router.use('*', tenantAuthMiddleware);

const createCheckoutSchema = z.object({
  customerId: z.string().uuid(),
  planId: z.string().uuid(),
  currency: z.string().default('NGN'),
  returnUrl: z.string().url(),
  metadata: z.record(z.string()).optional(),
});

router.post('/', zValidator('json', createCheckoutSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');

  const plan = await planQueries.findPlanById(sql, tenant.id, input.planId);
  if (!plan) return c.json({ error: { code: 'plan_not_found', message: 'Plan not found' } }, 404);

  const customer = await customerQueries.findCustomerById(sql, tenant.id, input.customerId);
  if (!customer) return c.json({ error: { code: 'customer_not_found', message: 'Customer not found' } }, 404);

  const price = plan.prices.find((p) => p.currency === input.currency);
  if (!price) {
    return c.json({ error: { code: 'price_not_found', message: `No price for currency ${input.currency}` } }, 422);
  }

  const sub = await createSubscription(sql, tenant.id, {
    customerId: input.customerId,
    planId: input.planId,
    currency: input.currency,
  });

  const orderReference = `checkout_${sub.id}_${Date.now()}`;

  await pendingCheckoutQueries.insertPendingCheckout(sql, {
    tenantId: tenant.id,
    subscriptionId: sub.id,
    customerId: input.customerId,
    orderReference,
    amount: price.amount,
    currency: input.currency,
  });

  const session = await createCheckoutSession(tenant, {
    orderReference,
    customerId: input.customerId,
    amount: price.amount,
    currency: input.currency,
    callbackUrl: config.NOMBA_CALLBACK_URL,
    returnUrl: input.returnUrl,
    saveCard: true,
    metadata: input.metadata,
  });

  return c.json({ checkoutUrl: session.checkoutUrl, orderReference, subscription: sub }, 201);
});

export { router as checkoutRoutes };
