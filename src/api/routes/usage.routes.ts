import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { reportUsage, getUsageSummary } from '../../domain/usage/usage.service';
import { reportUsageSchema } from '../validators/usage.validator';

const router = new Hono();

router.use('*', tenantAuthMiddleware);

router.post('/:id/usage', zValidator('json', reportUsageSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');
  const record = await reportUsage(sql, tenant.id, {
    subscriptionId: c.req.param('id'),
    ...input,
  });
  return c.json({ usage: record }, 201);
});

router.get('/:id/usage', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const summary = await getUsageSummary(sql, tenant.id, c.req.param('id'));
  return c.json(summary);
});

export { router as usageRoutes };
