import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { registerEndpoint, listEndpoints, getEndpoint, getDeliveries } from '../../domain/webhook/webhook.service';
import { registerWebhookSchema } from '../validators/webhook.validator';

const router = new Hono();

router.use('*', tenantAuthMiddleware);

router.post('/endpoints', zValidator('json', registerWebhookSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');
  const endpoint = await registerEndpoint(sql, tenant.id, input);
  return c.json({ endpoint }, 201);
});

router.get('/endpoints', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const endpoints = await listEndpoints(sql, tenant.id);
  return c.json({ endpoints });
});

router.get('/endpoints/:id', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const endpoint = await getEndpoint(sql, tenant.id, c.req.param('id'));
  return c.json({ endpoint });
});

router.get('/endpoints/:id/deliveries', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const deliveries = await getDeliveries(sql, tenant.id, c.req.param('id'));
  return c.json({ deliveries });
});

export { router as webhookRoutes };
