import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { createPlan, getPlan, listPlans, archivePlan, updatePlan } from '../../domain/plan/plan.service';
import { createPlanSchema, updatePlanSchema, listPlansQuerySchema } from '../validators/plan.validator';

const router = new Hono();

router.use('*', tenantAuthMiddleware);

router.post('/', zValidator('json', createPlanSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');
  const plan = await createPlan(sql, tenant.id, input);
  return c.json({ plan }, 201);
});

router.get('/', zValidator('query', listPlansQuerySchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const query = c.req.valid('query');
  const plans = await listPlans(sql, tenant.id, query);
  return c.json({ plans });
});

router.get('/:id', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const plan = await getPlan(sql, tenant.id, c.req.param('id'));
  return c.json({ plan });
});

router.patch('/:id', zValidator('json', updatePlanSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');
  const plan = await updatePlan(sql, tenant.id, c.req.param('id'), input);
  return c.json({ plan });
});

router.delete('/:id', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const plan = await archivePlan(sql, tenant.id, c.req.param('id'));
  return c.json({ plan });
});

export { router as planRoutes };
