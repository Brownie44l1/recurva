import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { registerEndpoint, listEndpoints, getEndpoint, updateEndpoint, deleteEndpoint, getDeliveries } from '../../domain/webhook/webhook.service';
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

router.patch('/endpoints/:id', zValidator('json', registerWebhookSchema.partial()), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');
  const endpoint = await updateEndpoint(sql, tenant.id, c.req.param('id'), input);
  return c.json({ endpoint });
});

router.delete('/endpoints/:id', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  await deleteEndpoint(sql, tenant.id, c.req.param('id'));
  return c.json({ status: 'deleted' });
});

router.get('/endpoints/:id/deliveries', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100'), 200);
  const deliveries = await getDeliveries(sql, tenant.id, c.req.param('id'), limit);
  return c.json({ deliveries });
});

router.post('/deliveries/:id/retry', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const deliveryId = c.req.param('id');
  const [delivery] = await sql<{ id: string; tenant_id: string; status: string; webhook_endpoint_id: string }[]>`
    SELECT id, tenant_id, status, webhook_endpoint_id FROM webhook_deliveries WHERE id = ${deliveryId} LIMIT 1
  `;
  if (!delivery || delivery.tenant_id !== tenant.id) {
    return c.json({ error: 'not_found' }, 404);
  }
  if (delivery.status !== 'failed') {
    return c.json({ error: 'delivery_not_failed' }, 422);
  }
  await sql`
    UPDATE webhook_deliveries SET status = 'pending', attempt_count = 0, next_retry_at = NOW(), updated_at = NOW() WHERE id = ${deliveryId}
  `;
  return c.json({ status: 'queued' });
});

export { router as webhookRoutes };
