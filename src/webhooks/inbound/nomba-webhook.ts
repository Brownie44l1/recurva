import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { getDb } from '../../db/client';
import * as subscriptionQueries from '../../db/queries/subscription.queries';
import * as invoiceQueries from '../../db/queries/invoice.queries';
import * as tenantQueries from '../../db/queries/tenant.queries';
import { transitionState } from '../../domain/subscription/subscription.service';
import { executeSideEffects } from '../../domain/subscription/side-effect.dispatcher';
import { getPaymentProcessor } from '../../domain/payment/payment.factory';
import { WebhookVerificationError } from '../../domain/payment/payment-processor.interface';
import { NombaAdapter } from '../../domain/payment/nomba.adapter';
import type { NormalizedPaymentEvent } from '../../domain/payment/payment-event.types';
import { logger } from '../../logger';
import { reportBillingError } from '../../observability/report-error';

function extractTenantId(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody);
    return parsed?.data?.tenantId ?? null;
  } catch {
    return null;
  }
}

export async function handleNombaWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  const signature = c.req.header('X-Nomba-Signature') ?? '';

  let event: NormalizedPaymentEvent;
  try {
    event = NombaAdapter.verifyAndParse(rawBody, signature);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      const isMissing = !signature;
      logger.warn(isMissing ? 'Missing X-Nomba-Signature header' : 'Invalid Nomba webhook signature');
      return c.json({ error: isMissing ? 'missing_signature' : 'invalid_signature' }, 401);
    }
    throw err;
  }

  const tenantId = event.metadata.tenantId as string | undefined;
  const sql = getDb();

  const routing: Record<string, (event: NormalizedPaymentEvent, sql: Sql) => Promise<string | undefined>> = {
    'payment.succeeded': handlePaymentSucceeded,
    'payment.failed': handlePaymentFailed,
    'payment.refunded': handlePaymentRefunded,
    'chargeback.opened': handleChargebackOpened,
  };

  const handler = routing[event.type];

  if (handler) {
    try {
      const result = await handler(event, sql);
      if (result === 'already_processed') {
        return c.json({ status: 'already_processed' });
      }
    } catch (err) {
      reportBillingError({ event: event.type, eventId: event.id }, 'Webhook handler failed', err);
    }
  } else {
    logger.warn({ event: event.type, eventId: event.id }, 'Unknown webhook event');
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO dead_letter_webhooks (nomba_event_id, event_type, payload, raw_body, reason)
        VALUES (${event.id}, ${event.type}, ${sql.json(event.metadata as any)}, ${JSON.stringify(event.rawPayload)}, 'unknown_event_type')
      `;
      await tx`
        INSERT INTO webhook_events (nomba_event_id, event_type, payload)
        VALUES (${event.id}, ${event.type}, ${sql.json(event.metadata as any)})
        ON CONFLICT (nomba_event_id) DO NOTHING
      `;
    });
  }

  return c.json({ status: 'processed' });
}

async function handlePaymentSucceeded(event: NormalizedPaymentEvent, sql: Sql): Promise<string | undefined> {
  const invoiceId = event.metadata.invoiceId as string | undefined;
  const tenantId = event.metadata.tenantId as string | undefined;

  if (!invoiceId || !tenantId) {
    logger.warn({ eventId: event.id }, 'payment.succeeded missing invoiceId or tenantId');
    return;
  }

  let alreadyProcessed = false;

  await sql.begin(async (tx) => {
    const s = tx as unknown as Sql;

    const inserted = await s`
      INSERT INTO webhook_events (nomba_event_id, event_type, payload)
      VALUES (${event.id}, ${event.type}, ${s.json(event.metadata as any)})
      ON CONFLICT (nomba_event_id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) {
      alreadyProcessed = true;
      return;
    }

    const charge = await invoiceQueries.findChargeByNombaReferenceWithLock(s, event.transactionId);
    if (charge && charge.status === 'succeeded') {
      return;
    }

    const invoice = await invoiceQueries.findInvoiceById(s, tenantId, invoiceId);
    if (!invoice || invoice.status === 'paid' || invoice.status === 'void') {
      return;
    }

    if (charge) {
      await invoiceQueries.updateChargeStatus(s, charge.id, 'succeeded', {
        nombaChargeId: event.transactionId,
        nombaReference: event.transactionId,
      });
    }

    await invoiceQueries.updateInvoiceStatus(s, invoiceId, 'paid');

    const creditUsed = invoice.total - invoice.amountDue;
    if (creditUsed > 0) {
      await subscriptionQueries.decrementCreditBalance(s, invoice.subscriptionId, creditUsed);
    }

    const subscription = await subscriptionQueries.findSubscriptionById(s, tenantId, invoice.subscriptionId);
    if (subscription && (subscription.status === 'past_due' || subscription.status === 'incomplete')) {
      const { subscription: sub, sideEffects } = await transitionState(s, tenantId, invoice.subscriptionId, 'PAYMENT_SUCCESS', {
        actorType: 'system',
        actorId: 'webhook',
      });
      await executeSideEffects(s, tenantId, sub, sideEffects, { actorType: 'system', actorId: 'webhook' });
    }

    logger.info({ invoiceId, eventId: event.id }, 'Charge success handled');
  });

  return alreadyProcessed ? 'already_processed' : undefined;
}

async function handlePaymentFailed(event: NormalizedPaymentEvent, sql: Sql): Promise<string | undefined> {
  const invoiceId = event.metadata.invoiceId as string | undefined;
  const tenantId = event.metadata.tenantId as string | undefined;
  const failureCode = event.metadata.failureCode as string | undefined;
  const failureMessage = event.metadata.failureMessage as string | undefined;

  if (!invoiceId || !tenantId) {
    logger.warn({ eventId: event.id }, 'payment.failed missing invoiceId or tenantId');
    return;
  }

  let alreadyProcessed = false;

  await sql.begin(async (tx) => {
    const s = tx as unknown as Sql;

    const inserted = await s`
      INSERT INTO webhook_events (nomba_event_id, event_type, payload)
      VALUES (${event.id}, ${event.type}, ${s.json(event.metadata as any)})
      ON CONFLICT (nomba_event_id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) {
      alreadyProcessed = true;
      return;
    }

    const charge = await invoiceQueries.findChargeByNombaReferenceWithLock(s, event.transactionId);
    if (charge && charge.status === 'failed') {
      return;
    }

    if (charge) {
      await invoiceQueries.updateChargeStatus(s, charge.id, 'failed', {
        failureMessage: failureMessage ?? 'Payment failed per webhook',
      });
    }

    const invoice = await invoiceQueries.findInvoiceById(s, tenantId, invoiceId);
    if (!invoice || invoice.status === 'paid' || invoice.status === 'void') {
      return;
    }

    const subscription = await subscriptionQueries.findSubscriptionById(s, tenantId, invoice.subscriptionId);
    if (subscription && subscription.status === 'active') {
      const { subscription: sub, sideEffects } = await transitionState(s, tenantId, invoice.subscriptionId, 'PAYMENT_FAILED', {
        actorType: 'system',
        actorId: 'webhook',
      });
      await executeSideEffects(s, tenantId, sub, sideEffects, { actorType: 'system', actorId: 'webhook' }, { invoiceId });
    }

    logger.info({ invoiceId, failureCode, eventId: event.id }, 'Charge failure recorded');
  });

  return alreadyProcessed ? 'already_processed' : undefined;
}

async function handlePaymentRefunded(event: NormalizedPaymentEvent, sql: Sql): Promise<string | undefined> {
  const chargeId = event.metadata.chargeId as string | undefined;
  const amount = event.amount;

  let alreadyProcessed = false;

  await sql.begin(async (tx) => {
    const s = tx as unknown as Sql;

    const inserted = await s`
      INSERT INTO webhook_events (nomba_event_id, event_type, payload)
      VALUES (${event.id}, ${event.type}, ${s.json(event.metadata as any)})
      ON CONFLICT (nomba_event_id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) {
      alreadyProcessed = true;
      return;
    }

    if (chargeId) {
      await s`
        UPDATE charges SET status = 'refunded', amount_refunded = COALESCE(${amount ?? 0}, 0), refunded_at = NOW() WHERE id = ${chargeId}
      `;
      logger.info({ chargeId, eventId: event.id }, 'Refund completed handled');
    }
  });

  return alreadyProcessed ? 'already_processed' : undefined;
}

async function handleChargebackOpened(event: NormalizedPaymentEvent, sql: Sql): Promise<string | undefined> {
  const invoiceId = event.metadata.invoiceId as string | undefined;
  logger.warn({ eventId: event.id, invoiceId, transactionId: event.transactionId }, 'Chargeback opened - manual review needed');
  return;
}
