import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import * as dunningQueries from '../../db/queries/dunning.queries';
import { NotFoundError } from '../../errors';

const retryScheduleEntrySchema = z.object({
  day: z.number().int().min(0),
  useBackup: z.boolean().optional(),
});

const createPolicySchema = z.object({
  name: z.string().min(1).max(100),
  retrySchedule: z.array(retryScheduleEntrySchema).min(1).max(20),
  finalAction: z.enum(['cancel', 'mark_unpaid']),
  isDefault: z.boolean().optional().default(false),
});

const updatePolicySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  retrySchedule: z.array(retryScheduleEntrySchema).min(1).max(20).optional(),
  finalAction: z.enum(['cancel', 'mark_unpaid']).optional(),
  isDefault: z.boolean().optional(),
});

const router = new Hono();

router.use('*', tenantAuthMiddleware);

router.post('/', zValidator('json', createPolicySchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');

  if (input.isDefault) {
    await dunningQueries.unsetDefaultDunningPolicy(sql, tenant.id);
  }

  const policy = await dunningQueries.insertDunningPolicy(sql, tenant.id, input);
  return c.json({ policy }, 201);
});

router.get('/', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const policies = await dunningQueries.listDunningPolicies(sql, tenant.id);
  return c.json({ policies });
});

router.get('/:id', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const policy = await dunningQueries.findDunningPolicyById(sql, c.req.param('id'));
  if (!policy || policy.tenantId !== tenant.id) throw new NotFoundError('DunningPolicy', c.req.param('id'));
  return c.json({ policy });
});

router.put('/:id', zValidator('json', updatePolicySchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const policyId = c.req.param('id');
  const input = c.req.valid('json');

  const existing = await dunningQueries.findDunningPolicyById(sql, policyId);
  if (!existing || existing.tenantId !== tenant.id) throw new NotFoundError('DunningPolicy', policyId);

  if (input.isDefault) {
    await dunningQueries.unsetDefaultDunningPolicy(sql, tenant.id);
  }

  const policy = await dunningQueries.updateDunningPolicy(sql, policyId, input);
  return c.json({ policy });
});

export { router as dunningPolicyRoutes };
