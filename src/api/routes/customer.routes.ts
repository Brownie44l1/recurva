import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { createCustomer, getCustomer, getCustomerByEmail, listCustomers, updateCustomer, deleteCustomer } from '../../domain/customer/customer.service';
import { createCustomerSchema, updateCustomerSchema } from '../validators/customer.validator';

const router = new Hono();

router.use('*', tenantAuthMiddleware);

router.post('/', zValidator('json', createCustomerSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');
  const customer = await createCustomer(sql, tenant.id, input);
  return c.json({ customer }, 201);
});

router.get('/', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const email = c.req.query('email');

  if (email) {
    const customer = await getCustomerByEmail(sql, tenant.id, email);
    if (!customer) return c.json({ customer: null }, 404);
    return c.json({ customer });
  }

  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');
  const customers = await listCustomers(sql, tenant.id, limit, offset);
  return c.json({ customers });
});

router.get('/:id', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const customer = await getCustomer(sql, tenant.id, c.req.param('id'));
  return c.json({ customer });
});

router.patch('/:id', zValidator('json', updateCustomerSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');
  const customer = await updateCustomer(sql, tenant.id, c.req.param('id'), input);
  return c.json({ customer });
});

router.delete('/:id', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  await deleteCustomer(sql, tenant.id, c.req.param('id'));
  return c.json({ success: true });
});

export { router as customerRoutes };
