import type { Context } from 'hono';
import type { Sql, TransactionSql } from 'postgres';
import { getDb } from '../../db/client';
import * as pendingCheckoutQueries from '../../db/queries/pending-checkout.queries';
import * as paymentMethodQueries from '../../db/queries/payment-method.queries';
import * as subscriptionQueries from '../../db/queries/subscription.queries';
import * as customerQueries from '../../db/queries/customer.queries';
import { config } from '../../config';
import { logger } from '../../logger';
import * as crypto from 'crypto';

interface NombaCheckoutCallbackPayload {
  event: 'checkout.completed';
  data: {
    orderReference: string;
    status: 'success' | 'failed';
    token: string;
    last4: string;
    cardBrand: string;
    expMonth: number;
    expYear: number;
    amount: number;
    currency: string;
    transactionId: string;
  };
  signature: string;
}

function verifySignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', config.NOMBA_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function handleNombaCheckoutCallback(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  let payload: NombaCheckoutCallbackPayload;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const providedSignature = payload.signature;
  const bodyWithoutSignature = JSON.stringify({ ...payload, signature: undefined });

  if (!verifySignature(bodyWithoutSignature, providedSignature)) {
    logger.warn({ orderReference: payload.data.orderReference }, 'Invalid Nomba webhook signature');
    return c.json({ error: 'invalid_signature' }, 401);
  }

  if (payload.event !== 'checkout.completed') {
    return c.json({ error: 'unsupported_event' }, 400);
  }

  if (payload.data.status !== 'success') {
    logger.info({ orderReference: payload.data.orderReference }, 'Checkout not successful, skipping');
    return c.json({ status: 'ignored' });
  }

  const sql = getDb();

  const result = await sql.begin(async (tx) => {
    const s = tx as unknown as Sql;

    const checkout = await pendingCheckoutQueries.findPendingCheckoutForUpdate(s, payload.data.orderReference);
    if (!checkout) {
      logger.warn({ orderReference: payload.data.orderReference }, 'Pending checkout not found');
      return { status: 404, body: { error: 'checkout_not_found' } };
    }

    if (checkout.consumed) {
      return { status: 200, body: { status: 'already_processed' } };
    }

    const pm = await paymentMethodQueries.insertPaymentMethod(s, checkout.tenantId, checkout.customerId, {
      nombaToken: payload.data.token,
      cardLast4: payload.data.last4,
      cardBrand: payload.data.cardBrand,
      cardExpMonth: payload.data.expMonth,
      cardExpYear: payload.data.expYear,
    });

    await pendingCheckoutQueries.markPendingCheckoutConsumed(s, checkout.id);

    const subscription = await subscriptionQueries.findSubscriptionById(s, checkout.tenantId, checkout.subscriptionId);
    if (subscription) {
      if (!subscription.paymentMethodId) {
        await subscriptionQueries.updateSubscriptionPaymentMethod(s, checkout.tenantId, checkout.subscriptionId, pm.id);
      }

      if (!pm.isPrimary) {
        const customer = await customerQueries.findCustomerById(s, checkout.tenantId, checkout.customerId);
        if (customer) {
          await paymentMethodQueries.promoteToPrimary(s, checkout.customerId, pm.id);
        }
      }
    }

    logger.info(
      { orderReference: checkout.orderReference, paymentMethodId: pm.id, subscriptionId: checkout.subscriptionId },
      'Checkout callback processed',
    );

    return { status: 200, body: { status: 'processed', paymentMethodId: pm.id } };
  });

  return c.json(result.body, result.status as any);
}
