import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../../db/client';
import { createTenant, getTenantById, generateNewApiKey } from '../../domain/tenant/tenant.service';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';

const router = new Hono();

const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(128).optional(),
});

router.post('/register', zValidator('json', registerSchema), async (c) => {
  const sql = getDb();
  const input = c.req.valid('json');
  const { tenant, rawApiKey } = await createTenant(sql, input);

  return c.json({
    tenant: { id: tenant.id, name: tenant.name, email: tenant.email },
    apiKey: rawApiKey,
  }, 201);
});

router.get('/me', tenantAuthMiddleware, async (c) => {
  const tenant = c.var.tenant;
  return c.json({ tenant: { id: tenant.id, name: tenant.name, email: tenant.email, isActive: tenant.isActive } });
});

router.post('/api-keys', tenantAuthMiddleware, async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const { rawKey, keyPrefix } = await generateNewApiKey(sql, tenant.id);
  return c.json({ apiKey: rawKey, keyPrefix }, 201);
});

export { router as tenantRoutes };
