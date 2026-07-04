import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { getDb } from '../../db/client';
import * as subscriptionQueries from '../../db/queries/subscription.queries';
import * as invoiceQueries from '../../db/queries/invoice.queries';
import { transitionState } from '../../domain/subscription/subscription.service';
import { executeSideEffects } from '../../domain/subscription/side-effect.dispatcher';
import { config } from '../../config';
import { logger } from '../../logger';
import { reportBillingError } from '../../observability/report-error';
import * as crypto from 'crypto';

interface NombaWebhookPayload {
  event: string;
  data: Record<string, unknown>;
  eventId: string;
  timestamp: string;
}

export async function handleNombaWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();

  const signature = c.req.header('X-Nomba-Signature');
  if (!signature) {
    logger.warn('Missing X-Nomba-Signature header');
    return c.json({ error: 'missing_signature' }, 401);
  }

  const expected = crypto
    .createHmac('sha256', config.NOMBA_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  let signatureValid = false;
  try {
    signatureValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return c.json({ error: 'invalid_signature' }, 401);
  }

  if (!signatureValid) {
    logger.warn({ signatureHash: expected.slice(0, 8) }, 'Invalid Nomba webhook signature');
    return c.json({ error: 'invalid_signature' }, 401);
  }

  let payload: NombaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const sql = getDb();

  const routing: Record<string, (payload: NombaWebhookPayload, sql: Sql) => Promise<string | undefined>> = {
    'charge.success': handleChargeSuccess,
    'charge.failure': handleChargeFailure,
    'refund.completed': handleRefundCompleted,
  };

  const handler = routing[payload.event];

  if (handler) {
    try {
      const result = await handler(payload, sql);
      if (result === 'already_processed') {
        return c.json({ status: 'already_processed' });
      }
    } catch (err) {
      reportBillingError({ event: payload.event, eventId: payload.eventId }, 'Nomba webhook handler failed', err);
    }
  } else {
    logger.warn({ event: payload.event, eventId: payload.eventId }, 'Unknown Nomba webhook event');
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO dead_letter_webhooks (nomba_event_id, event_type, payload, raw_body, reason)
        VALUES (${payload.eventId}, ${payload.event}, ${sql.json(payload.data as any)}, ${rawBody}, 'unknown_event_type')
      `;
      await tx`
        INSERT INTO webhook_events (nomba_event_id, event_type, payload)
        VALUES (${payload.eventId}, ${payload.event}, ${sql.json(payload.data as any)})
        ON CONFLICT (nomba_event_id) DO NOTHING
      `;
    });
  }

  return c.json({ status: 'processed' });
}

async function handleChargeSuccess(payload: NombaWebhookPayload, sql: Sql): Promise<string | undefined> {
  const data = payload.data as {
    transactionId?: string;
    invoiceId?: string;
    subscriptionId?: string;
    tenantId?: string;
  };

  if (!data.invoiceId || !data.tenantId) {
    logger.warn({ eventId: payload.eventId }, 'charge.success missing invoiceId or tenantId');
    return;
  }

  let alreadyProcessed = false;

  await sql.begin(async (tx) => {
    const s = tx as unknown as Sql;

    const inserted = await s`
      INSERT INTO webhook_events (nomba_event_id, event_type, payload)
      VALUES (${payload.eventId}, ${payload.event}, ${s.json(payload.data as any)})
      ON CONFLICT (nomba_event_id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) {
      alreadyProcessed = true;
      return;
    }

    const charge = await invoiceQueries.findChargeByNombaReferenceWithLock(s, `${data.transactionId}`);
    if (charge && charge.status === 'succeeded') {
      return;
    }

    const invoice = await invoiceQueries.findInvoiceById(s, data.tenantId!, data.invoiceId!);
    if (!invoice || invoice.status === 'paid' || invoice.status === 'void') {
      return;
    }

    if (charge) {
      await invoiceQueries.updateChargeStatus(s, charge.id, 'succeeded', {
        nombaChargeId: data.transactionId,
        nombaReference: data.transactionId,
      });
    }

    await invoiceQueries.updateInvoiceStatus(s, data.invoiceId!, 'paid');

    const creditUsed = invoice.total - invoice.amountDue;
    if (creditUsed > 0) {
      await subscriptionQueries.decrementCreditBalance(s, invoice.subscriptionId, creditUsed);
    }

    const subscription = await subscriptionQueries.findSubscriptionById(s, data.tenantId!, invoice.subscriptionId);
    if (subscription && (subscription.status === 'past_due' || subscription.status === 'incomplete')) {
      const { subscription: sub, sideEffects } = await transitionState(s, data.tenantId!, invoice.subscriptionId, 'PAYMENT_SUCCESS', {
        actorType: 'system',
        actorId: 'nomba-webhook',
      });
      await executeSideEffects(s, data.tenantId!, sub, sideEffects, { actorType: 'system', actorId: 'nomba-webhook' });
    }

    logger.info({ invoiceId: data.invoiceId, eventId: payload.eventId }, 'Charge success handled');
  });

  return alreadyProcessed ? 'already_processed' : undefined;
}

async function handleChargeFailure(payload: NombaWebhookPayload, sql: Sql): Promise<string | undefined> {
  const data = payload.data as {
    transactionId?: string;
    invoiceId?: string;
    subscriptionId?: string;
    tenantId?: string;
    failureCode?: string;
    failureMessage?: string;
  };

  if (!data.invoiceId || !data.tenantId) {
    logger.warn({ eventId: payload.eventId }, 'charge.failure missing invoiceId or tenantId');
    return;
  }

  let alreadyProcessed = false;

  await sql.begin(async (tx) => {
    const s = tx as unknown as Sql;

    const inserted = await s`
      INSERT INTO webhook_events (nomba_event_id, event_type, payload)
      VALUES (${payload.eventId}, ${payload.event}, ${s.json(payload.data as any)})
      ON CONFLICT (nomba_event_id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) {
      alreadyProcessed = true;
      return;
    }

    const charge = await invoiceQueries.findChargeByNombaReferenceWithLock(s, `${data.transactionId}`);
    if (charge && charge.status === 'failed') {
      return;
    }

    if (charge) {
      await invoiceQueries.updateChargeStatus(s, charge.id, 'failed', {
        failureMessage: data.failureMessage ?? 'Payment failed per Nomba webhook',
      });
    }

    const invoice = await invoiceQueries.findInvoiceById(s, data.tenantId!, data.invoiceId!);
    if (!invoice || invoice.status === 'paid' || invoice.status === 'void') {
      return;
    }

    const subscription = await subscriptionQueries.findSubscriptionById(s, data.tenantId!, invoice.subscriptionId);
    if (subscription && subscription.status === 'active') {
      const { subscription: sub, sideEffects } = await transitionState(s, data.tenantId!, invoice.subscriptionId, 'PAYMENT_FAILED', {
        actorType: 'system',
        actorId: 'nomba-webhook',
      });
      await executeSideEffects(s, data.tenantId!, sub, sideEffects, { actorType: 'system', actorId: 'nomba-webhook' }, { invoiceId: data.invoiceId });
    }

    logger.info({ invoiceId: data.invoiceId, failureCode: data.failureCode, eventId: payload.eventId }, 'Charge failure recorded');
  });

  return alreadyProcessed ? 'already_processed' : undefined;
}

async function handleRefundCompleted(payload: NombaWebhookPayload, sql: Sql): Promise<string | undefined> {
  const data = payload.data as {
    transactionId?: string;
    chargeId?: string;
    amount?: number;
  };

  let alreadyProcessed = false;

  await sql.begin(async (tx) => {
    const s = tx as unknown as Sql;

    const inserted = await s`
      INSERT INTO webhook_events (nomba_event_id, event_type, payload)
      VALUES (${payload.eventId}, ${payload.event}, ${s.json(payload.data as any)})
      ON CONFLICT (nomba_event_id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) {
      alreadyProcessed = true;
      return;
    }

    if (data.chargeId) {
      await s`
        UPDATE charges SET status = 'refunded', amount_refunded = COALESCE(${data.amount ?? 0}, 0), refunded_at = NOW() WHERE id = ${data.chargeId}
      `;
      logger.info({ chargeId: data.chargeId, eventId: payload.eventId }, 'Refund completed handled');
    }
  });

  return alreadyProcessed ? 'already_processed' : undefined;
}
