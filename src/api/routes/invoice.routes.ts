import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { listInvoices, getInvoice, voidInvoice } from '../../domain/invoice/invoice.service';
import { retryCharge } from '../../domain/billing/billing.service';
import { getPaymentProcessor } from '../../domain/payment/payment.factory';
import * as invoiceQueries from '../../db/queries/invoice.queries';
import { NotFoundError, ValidationError } from '../../errors';

const refundSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().max(500).optional(),
});

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

router.post('/:id/refund', zValidator('json', refundSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const invoiceId = c.req.param('id');
  const { amount, reason } = c.req.valid('json');

  const invoice = await getInvoice(sql, tenant.id, invoiceId);
  if (invoice.status !== 'paid') {
    throw new ValidationError('Only paid invoices can be refunded');
  }

  const charge = await invoiceQueries.findSucceededChargeForInvoice(sql, invoiceId);
  if (!charge) {
    throw new NotFoundError('Succeeded charge for invoice', invoiceId);
  }

  if (!charge.nombaReference) {
    throw new ValidationError('Charge has no Nomba reference for refund');
  }

  const reference = `refund_${invoiceId}_${Date.now()}`;
  const result = await getPaymentProcessor(tenant).refund({
    transactionId: charge.nombaReference,
    amount,
    reason: reason ?? 'Customer requested refund',
    reference,
  });

  await invoiceQueries.updateChargeByNombaReference(sql, charge.nombaReference, {
    status: 'refunded',
    amountRefunded: amount,
  });

  return c.json({ refund: result });
});

export { router as invoiceRoutes };
