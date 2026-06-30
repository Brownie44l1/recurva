import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { getCustomer } from '../../domain/customer/customer.service';
import { attachPaymentMethod, listPaymentMethods, setDefaultPaymentMethod, deletePaymentMethod } from '../../domain/payment-method/payment-method.service';

const router = new Hono();

router.use('*', tenantAuthMiddleware);

const attachSchema = z.object({
  nombaToken: z.string().min(1),
  cardLast4: z.string().regex(/^\d{4}$/),
  cardBrand: z.string().min(1),
  cardExpMonth: z.number().int().min(1).max(12),
  cardExpYear: z.number().int().min(2020),
});

router.get('/customers/:customerId/payment-methods', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const methods = await listPaymentMethods(sql, tenant.id, c.req.param('customerId'));
  return c.json({ paymentMethods: methods });
});

router.post('/customers/:customerId/payment-methods', zValidator('json', attachSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const customerId = c.req.param('customerId');
  await getCustomer(sql, tenant.id, customerId);
  const input = c.req.valid('json');
  const method = await attachPaymentMethod(sql, tenant.id, customerId, input);
  return c.json({ paymentMethod: method }, 201);
});

router.patch('/customers/:customerId/payment-methods/:pmId/primary', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  await setDefaultPaymentMethod(sql, tenant.id, c.req.param('customerId'), c.req.param('pmId'));
  return c.json({ success: true });
});

router.delete('/customers/:customerId/payment-methods/:pmId', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  await deletePaymentMethod(sql, tenant.id, c.req.param('pmId'));
  return c.json({ success: true });
});

export { router as paymentMethodRoutes };
