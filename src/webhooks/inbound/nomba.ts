import type { Context } from 'hono';
import { getDb } from '../../db/client';
import * as pendingCheckoutQueries from '../../db/queries/pending-checkout.queries';
import * as paymentMethodQueries from '../../db/queries/payment-method.queries';
import * as subscriptionQueries from '../../db/queries/subscription.queries';
import * as customerQueries from '../../db/queries/customer.queries';
import { config } from '../../config';
import { logger } from '../../logger';
import * as crypto from 'crypto';
import { transitionState } from '../../domain/subscription/subscription.service';

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

  const checkout = await pendingCheckoutQueries.findPendingCheckoutByReference(sql, payload.data.orderReference);
  if (!checkout) {
    logger.warn({ orderReference: payload.data.orderReference }, 'Pending checkout not found');
    return c.json({ error: 'checkout_not_found' }, 404);
  }

  if (checkout.consumed) {
    return c.json({ status: 'already_processed' });
  }

  const pm = await paymentMethodQueries.insertPaymentMethod(sql, checkout.tenantId, checkout.customerId, {
    nombaToken: payload.data.token,
    cardLast4: payload.data.last4,
    cardBrand: payload.data.cardBrand,
    cardExpMonth: payload.data.expMonth,
    cardExpYear: payload.data.expYear,
  });

  await pendingCheckoutQueries.markPendingCheckoutConsumed(sql, checkout.id);

  const subscription = await subscriptionQueries.findSubscriptionById(sql, checkout.tenantId, checkout.subscriptionId);
  if (subscription) {
    if (!subscription.paymentMethodId) {
      await subscriptionQueries.updateSubscriptionPaymentMethod(sql, checkout.tenantId, checkout.subscriptionId, pm.id);
    }

    if (subscription.status === 'incomplete') {
      await transitionState(sql, checkout.tenantId, checkout.subscriptionId, 'CHECKOUT_COMPLETED', {
        actorType: 'system',
        actorId: 'nomba-checkout',
      });
    }

    if (!pm.isPrimary) {
      const customer = await customerQueries.findCustomerById(sql, checkout.tenantId, checkout.customerId);
      if (customer) {
        await paymentMethodQueries.promoteToPrimary(sql, checkout.customerId, pm.id);
      }
    }
  }

  logger.info(
    { orderReference: checkout.orderReference, paymentMethodId: pm.id, subscriptionId: checkout.subscriptionId },
    'Checkout callback processed',
  );

  return c.json({ status: 'processed', paymentMethodId: pm.id });
}
