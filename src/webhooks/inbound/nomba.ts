import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { getDb } from '../../db/client';
import * as pendingCheckoutQueries from '../../db/queries/pending-checkout.queries';
import * as paymentMethodQueries from '../../db/queries/payment-method.queries';
import * as subscriptionQueries from '../../db/queries/subscription.queries';
import * as customerQueries from '../../db/queries/customer.queries';
import * as tenantQueries from '../../db/queries/tenant.queries';
import { logger } from '../../logger';
import { transitionState } from '../../domain/subscription/subscription.service';
import { NombaAdapter } from '../../domain/payment/nomba.adapter';
import { WebhookVerificationError } from '../../domain/payment/payment-processor.interface';
import type { NormalizedPaymentEvent } from '../../domain/payment/payment-event.types';

function extractOrderReference(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody);
    return parsed?.data?.orderReference ?? null;
  } catch {
    return null;
  }
}

function extractCheckoutSignature(rawBody: string, headerSig: string | undefined): string {
  if (headerSig) return headerSig;
  try {
    const parsed = JSON.parse(rawBody);
    return (parsed?.signature as string) ?? '';
  } catch {
    return '';
  }
}

export async function handleNombaCheckoutCallback(c: Context): Promise<Response> {
  const rawBody = await c.req.text();

  const headerSig = c.req.header('nomba-signature');
  const signature = extractCheckoutSignature(rawBody, headerSig);
  const isMissing = !signature;

  const orderReference = extractOrderReference(rawBody);
  if (!orderReference) {
    return c.json({ error: 'invalid_payload' }, 400);
  }

  const sql = getDb();

  const checkout = await pendingCheckoutQueries.findPendingCheckoutByReference(sql, orderReference);
  if (!checkout) {
    logger.warn({ orderReference }, 'Pending checkout not found');
    return c.json({ error: 'checkout_not_found' }, 404);
  }

  const tenant = await tenantQueries.findTenantById(sql, checkout.tenantId);
  if (!tenant) {
    logger.warn({ tenantId: checkout.tenantId }, 'Tenant not found for checkout callback');
    return c.json({ error: 'tenant_not_found' }, 404);
  }

  let event: NormalizedPaymentEvent;
  try {
    const adapter = new NombaAdapter(tenant);
    event = await adapter.handleWebhook(rawBody, signature);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      logger.warn({ orderReference }, isMissing ? 'Missing Nomba webhook signature' : 'Invalid Nomba webhook signature');
      return c.json({ error: isMissing ? 'missing_signature' : 'invalid_signature' }, 401);
    }
    throw err;
  }

  if (event.type !== 'checkout.completed') {
    return c.json({ error: 'unexpected_event' }, 400);
  }

  if (checkout.consumed) {
    return c.json({ status: 'already_processed' });
  }

  const status = event.metadata.status as string | undefined;
  if (status && status !== 'success') {
    logger.info({ orderReference }, 'Checkout not successful, skipping');
    return c.json({ status: 'ignored' });
  }

  const result = await sql.begin(async (tx) => {
    const s = tx as unknown as Sql;

    const checkoutLock = await pendingCheckoutQueries.findPendingCheckoutForUpdate(s, orderReference);
    if (!checkoutLock) {
      return { status: 404, body: { error: 'checkout_not_found' } };
    }

    if (checkoutLock.consumed) {
      return { status: 200, body: { status: 'already_processed' } };
    }

    const pm = await paymentMethodQueries.insertPaymentMethod(s, checkoutLock.tenantId, checkoutLock.customerId, {
      nombaToken: event.metadata.token as string,
      cardLast4: event.metadata.last4 as string,
      cardBrand: event.metadata.cardBrand as string,
      cardExpMonth: event.metadata.expMonth as number,
      cardExpYear: event.metadata.expYear as number,
    });

    await pendingCheckoutQueries.markPendingCheckoutConsumed(s, checkoutLock.id);

    const subscription = await subscriptionQueries.findSubscriptionById(s, checkoutLock.tenantId, checkoutLock.subscriptionId);
    if (subscription) {
      if (!subscription.paymentMethodId) {
        await subscriptionQueries.updateSubscriptionPaymentMethod(s, checkoutLock.tenantId, checkoutLock.subscriptionId, pm.id);
      }

      if (subscription.status === 'incomplete') {
        await transitionState(s, checkoutLock.tenantId, checkoutLock.subscriptionId, 'CHECKOUT_COMPLETED', {
          actorType: 'system',
          actorId: 'webhook',
        });
      }
    }

    if (!pm.isPrimary) {
      const customer = await customerQueries.findCustomerById(s, checkoutLock.tenantId, checkoutLock.customerId);
      if (customer) {
        await paymentMethodQueries.promoteToPrimary(s, checkoutLock.customerId, pm.id);
      }
    }

    logger.info(
      { orderReference: checkoutLock.orderReference, paymentMethodId: pm.id, subscriptionId: checkoutLock.subscriptionId },
      'Checkout callback processed',
    );

    return { status: 200, body: { status: 'processed', paymentMethodId: pm.id } };
  });

  return c.json(result.body, result.status as any);
}
