import { Hono } from 'hono';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { listInvoices, getInvoice, voidInvoice } from '../../domain/invoice/invoice.service';
import { retryCharge } from '../../domain/billing/billing.service';

const router = new Hono();

router.use('*', tenantAuthMiddleware);

router.get('/', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const customerId = c.req.query('customerId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');

  if (!customerId) return c.json({ invoices: [] });
  const invoices = await listInvoices(sql, tenant.id, customerId, limit, offset);
  return c.json({ invoices });
});

router.get('/:id', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const invoice = await getInvoice(sql, tenant.id, c.req.param('id'));
  return c.json({ invoice });
});

router.post('/:id/retry', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const result = await retryCharge(sql, tenant.id, c.req.param('id'));
  return c.json(result);
});

router.post('/:id/void', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const invoice = await voidInvoice(sql, tenant.id, c.req.param('id'));
  return c.json({ invoice });
});

export { router as invoiceRoutes };
