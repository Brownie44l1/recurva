import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { getDb } from '../../db/client';
import { config } from '../../config';
import { logger } from '../../logger';
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

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM webhook_events WHERE nomba_event_id = ${payload.eventId} LIMIT 1
  `;
  if (existing.length > 0) {
    return c.json({ status: 'already_processed' });
  }

  const routing: Record<string, (payload: NombaWebhookPayload, sql: Sql) => Promise<void>> = {
    'charge.success': handleChargeSuccess,
    'charge.failure': handleChargeFailure,
    'refund.completed': handleRefundCompleted,
  };

  const handler = routing[payload.event];
  if (handler) {
    await handler(payload, sql);
  } else {
    logger.warn({ event: payload.event, eventId: payload.eventId }, 'Unknown Nomba webhook event');
    await sql`
      INSERT INTO dead_letter_webhooks (nomba_event_id, event_type, payload, raw_body, reason)
      VALUES (${payload.eventId}, ${payload.event}, ${sql.json(payload.data as any)}, ${rawBody}, 'unknown_event_type')
    `;
  }

  await sql`
    INSERT INTO webhook_events (nomba_event_id, event_type, payload)
    VALUES (${payload.eventId}, ${payload.event}, ${sql.json(payload.data as any)})
  `;

  return c.json({ status: 'processed' });
}

async function handleChargeSuccess(payload: NombaWebhookPayload, sql: ReturnType<typeof getDb>): Promise<void> {
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

  const invoice = await sql<{ id: string; status: string; subscription_id: string }[]>`
    SELECT id, status, subscription_id FROM invoices WHERE id = ${data.invoiceId} AND tenant_id = ${data.tenantId} LIMIT 1
  `;
  if (invoice.length === 0 || invoice[0]!.status === 'paid' || invoice[0]!.status === 'void') {
    return;
  }

  await sql`UPDATE invoices SET status = 'paid', paid_at = NOW(), nomba_charge_id = ${data.transactionId ?? null}, updated_at = NOW() WHERE id = ${data.invoiceId}`;

  const sub = await sql<{ id: string; status: string; tenant_id: string }[]>`
    SELECT id, status, tenant_id FROM subscriptions WHERE id = ${invoice[0]!.subscription_id} LIMIT 1
  `;
  if (sub.length > 0 && (sub[0]!.status === 'past_due' || sub[0]!.status === 'incomplete')) {
    await sql`UPDATE subscriptions SET status = 'active', updated_at = NOW() WHERE id = ${sub[0]!.id}`;
  }

  logger.info({ invoiceId: data.invoiceId, eventId: payload.eventId }, 'Charge success handled');
}

async function handleChargeFailure(payload: NombaWebhookPayload, sql: ReturnType<typeof getDb>): Promise<void> {
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

  const invoice = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM invoices WHERE id = ${data.invoiceId} AND tenant_id = ${data.tenantId} LIMIT 1
  `;
  if (invoice.length === 0 || invoice[0]!.status === 'paid' || invoice[0]!.status === 'void') {
    return;
  }

  logger.info({ invoiceId: data.invoiceId, failureCode: data.failureCode, eventId: payload.eventId }, 'Charge failure recorded');
}

async function handleRefundCompleted(payload: NombaWebhookPayload, sql: ReturnType<typeof getDb>): Promise<void> {
  const data = payload.data as {
    transactionId?: string;
    chargeId?: string;
    amount?: number;
  };

  if (data.chargeId) {
    await sql`
      UPDATE charges SET status = 'refunded', amount_refunded = COALESCE(${data.amount ?? 0}, 0), refunded_at = NOW() WHERE id = ${data.chargeId}
    `;
    logger.info({ chargeId: data.chargeId, eventId: payload.eventId }, 'Refund completed handled');
  }
}
