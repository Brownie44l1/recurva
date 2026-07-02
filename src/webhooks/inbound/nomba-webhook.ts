import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { getDb } from '../../db/client';
import * as subscriptionQueries from '../../db/queries/subscription.queries';
import * as invoiceQueries from '../../db/queries/invoice.queries';
import { transitionState } from '../../domain/subscription/subscription.service';
import { config } from '../../config';
import { logger } from '../../logger';
import * as crypto from 'crypto';

interface NombaWebhookPayload {
  event: string;
  data: {
    orderReference?: string;
    transactionId: string;
    amount: number;
    currency: string;
    status: string;
    signature?: string;
    [key: string]: unknown;
  };
}

function verifyFieldSelectiveSignature(payload: NombaWebhookPayload, headerSignature: string): boolean {
  const fields = [
    payload.event,
    payload.data.orderReference ?? '',
    payload.data.transactionId,
    String(payload.data.amount),
    payload.data.currency,
  ];

  const hashPayload = fields.join(':');

  const expected = crypto
    .createHmac('sha256', config.NOMBA_WEBHOOK_SECRET)
    .update(hashPayload)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerSignature));
}

export async function handleNombaWebhookEvent(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  let payload: NombaWebhookPayload;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const headerSignature =
    c.req.header('nomba-signature') ||
    c.req.header('x-nomba-signature') ||
    (payload.data?.signature as string | undefined);

  if (!headerSignature || !verifyFieldSelectiveSignature(payload, headerSignature)) {
    logger.warn({ event: payload.event, transactionId: payload.data?.transactionId }, 'Invalid Nomba webhook signature');
    return c.json({ error: 'invalid_signature' }, 401);
  }

  const sql = getDb();

  switch (payload.event) {
    case 'payment_success':
      return handlePaymentSuccess(sql, payload);
    case 'payment_failed':
      return handlePaymentFailed(sql, payload);
    case 'refund.completed':
      return handleRefundCompleted(sql, payload);
    default:
      logger.warn({ event: payload.event }, 'Unsupported Nomba webhook event');
      return c.json({ error: 'unsupported_event' }, 400);
  }
}

async function handlePaymentSuccess(sql: Sql, payload: NombaWebhookPayload): Promise<Response> {
  const transactionId = payload.data.transactionId;

  const result = await sql.begin(async (tx) => {
    const s = tx as unknown as Sql;

    const charge = await invoiceQueries.findChargeByNombaReferenceWithLock(s, transactionId);
    if (!charge) {
      logger.warn({ transactionId }, 'Charge not found for payment_success webhook');
      return { status: 404, body: { error: 'charge_not_found' } };
    }

    if (charge.status === 'succeeded') {
      return { status: 200, body: { status: 'already_processed' } };
    }

    await invoiceQueries.updateChargeStatus(s, charge.id, 'succeeded', {
      nombaChargeId: transactionId,
      nombaReference: transactionId,
    });

    const invoice = await invoiceQueries.findInvoiceById(s, charge.tenantId, charge.invoiceId);
    if (!invoice) {
      logger.warn({ chargeId: charge.id }, 'Invoice not found for charge');
      return { status: 404, body: { error: 'invoice_not_found' } };
    }

    await invoiceQueries.updateInvoiceStatus(s, charge.invoiceId, 'paid');

    const subscription = await subscriptionQueries.findSubscriptionById(s, charge.tenantId, invoice.subscriptionId);
    if (subscription) {
      await transitionState(s, charge.tenantId, invoice.subscriptionId, 'PAYMENT_SUCCESS', {
        actorType: 'system',
        actorId: 'nomba-webhook',
      });
    }

    logger.info({ transactionId, chargeId: charge.id }, 'Payment confirmed via webhook');
    return { status: 200, body: { status: 'processed' } };
  });

  return new Response(JSON.stringify(result.body), {
    status: result.status as any,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handlePaymentFailed(sql: Sql, payload: NombaWebhookPayload): Promise<Response> {
  const transactionId = payload.data.transactionId;

  const result = await sql.begin(async (tx) => {
    const s = tx as unknown as Sql;

    const charge = await invoiceQueries.findChargeByNombaReferenceWithLock(s, transactionId);
    if (!charge) {
      logger.warn({ transactionId }, 'Charge not found for payment_failed webhook');
      return { status: 404, body: { error: 'charge_not_found' } };
    }

    if (charge.status === 'failed') {
      return { status: 200, body: { status: 'already_processed' } };
    }

    await invoiceQueries.updateChargeStatus(s, charge.id, 'failed', {
      failureMessage: 'Payment failed per Nomba webhook',
    });

    const invoice = await invoiceQueries.findInvoiceById(s, charge.tenantId, charge.invoiceId);
    if (!invoice) {
      logger.warn({ chargeId: charge.id }, 'Invoice not found for charge');
      return { status: 404, body: { error: 'invoice_not_found' } };
    }

    const subscription = await subscriptionQueries.findSubscriptionById(s, charge.tenantId, invoice.subscriptionId);
    if (subscription) {
      await transitionState(s, charge.tenantId, invoice.subscriptionId, 'PAYMENT_FAILED', {
        actorType: 'system',
        actorId: 'nomba-webhook',
      });
    }

    logger.info({ transactionId, chargeId: charge.id }, 'Payment failure confirmed via webhook');
    return { status: 200, body: { status: 'processed' } };
  });

  return new Response(JSON.stringify(result.body), {
    status: result.status as any,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleRefundCompleted(sql: Sql, payload: NombaWebhookPayload): Promise<Response> {
  const transactionId = payload.data.transactionId;

  await invoiceQueries.updateChargeByNombaReference(sql, transactionId, {
    status: 'refunded',
    amountRefunded: payload.data.amount,
  });

  logger.info({ transactionId }, 'Refund completed via webhook');
  return new Response(JSON.stringify({ status: 'processed' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
