import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDb, closeDb } from '../../src/db/client';
import * as subscriptionQueries from '../../src/db/queries/subscription.queries';
import * as dunningQueries from '../../src/db/queries/dunning.queries';
import { config } from '../../src/config';
import * as crypto from 'crypto';
import { createApp } from '../../src/api/app';

const WEBHOOK_SECRET = config.NOMBA_WEBHOOK_SECRET || 'NombaHackathon2026';

function signWebhook(rawBody: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

function buildChargeFailurePayload(overrides: Record<string, unknown> = {}) {
  const eventId = `evt_fail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    event: 'charge.failure',
    eventId,
    timestamp: new Date().toISOString(),
    data: {
      transactionId: 'txn_fail_test',
      invoiceId: '00000000-0000-0000-0000-000000000000',
      subscriptionId: '00000000-0000-0000-0000-000000000000',
      tenantId: '00000000-0000-0000-0000-000000000000',
      failureCode: 'card_declined',
      failureMessage: 'Card was declined by the issuer',
      ...overrides,
    },
  };
}

describe('Nomba Webhook Integration - signature rejection', () => {
  let sql: ReturnType<typeof getDb>;
  let server: any;

  beforeAll(async () => {
    server = Bun.serve({
      port: config.PORT,
      fetch: createApp().fetch,
    });

    sql = getDb();
  });

  afterAll(async () => {
    server.stop();
  });

  it('rejects webhook with missing X-Nomba-Signature header', async () => {
    const payload = {
      event: 'charge.success',
      eventId: 'test_missing_sig',
      timestamp: new Date().toISOString(),
      data: { transactionId: 'none', tenantId: 'none', invoiceId: 'none' },
    };

    const response = await fetch(`http://localhost:${config.PORT}/webhooks/nomba`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(401);
    const result = await response.json() as { error: string };
    expect(result.error).toBe('missing_signature');

    const events = await sql`SELECT COUNT(*)::int AS cnt FROM webhook_events WHERE nomba_event_id = 'test_missing_sig'`;
    expect(events[0]!.cnt).toBe(0);
  });

  it('rejects webhook with wrong X-Nomba-Signature', async () => {
    const payload = {
      event: 'charge.success',
      eventId: 'test_wrong_sig',
      timestamp: new Date().toISOString(),
      data: { transactionId: 'none', tenantId: 'none', invoiceId: 'none' },
    };

    const response = await fetch(`http://localhost:${config.PORT}/webhooks/nomba`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nomba-Signature': 'a'.repeat(64),
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(401);
    const result = await response.json() as { error: string };
    expect(result.error).toBe('invalid_signature');

    const events = await sql`SELECT COUNT(*)::int AS cnt FROM webhook_events WHERE nomba_event_id = 'test_wrong_sig'`;
    expect(events[0]!.cnt).toBe(0);
  });
});

describe('Nomba Webhook Integration - charge.failure', () => {
  let sql: ReturnType<typeof getDb>;
  let tenantId: string;
  let customerId: string;
  let planId: string;
  let subscriptionId: string;
  let invoiceId: string;
  let chargeId: string;
  let transactionId: string;
  let server: any;

  beforeAll(async () => {
    server = Bun.serve({
      port: config.PORT,
      fetch: createApp().fetch,
    });

    sql = getDb();

    const [tenant] = await sql`
      INSERT INTO tenants (name, email, nomba_account_id, webhook_secret, mode)
      VALUES ('Webhook Test', 'wh-test@example.com', 'acc_wh', 'whsec_test', 'test')
      RETURNING id
    `;
    tenantId = tenant!.id;

    const [customer] = await sql`
      INSERT INTO customers (tenant_id, email, name, currency)
      VALUES (${tenantId}, 'wh-customer@example.com', 'WH Customer', 'NGN')
      RETURNING id
    `;
    customerId = customer!.id;

    const [plan] = await sql`
      INSERT INTO plans (tenant_id, name, description, billing_type, interval, interval_count, trial_days)
      VALUES (${tenantId}, 'WH Test Plan', 'A plan for webhook tests', 'fixed', 'month', 1, 0)
      RETURNING id
    `;
    planId = plan!.id;

    await sql`
      INSERT INTO plan_currencies (plan_id, currency, amount, unit_amount)
      VALUES (${planId}, 'NGN', 5000, 0)
    `;

    transactionId = `txn_fail_test_${Date.now()}`;

    await sql`
      INSERT INTO dunning_policies (tenant_id, name, retry_schedule, final_action, is_default)
      VALUES (${tenantId}, 'Default', '[{"day": 0, "useBackup": true}, {"day": 1}]', 'cancel', true)
    `;
  });

  afterAll(async () => {
    server.stop();
    await sql`DELETE FROM dunning_attempts WHERE subscription_id IN (SELECT id FROM subscriptions WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM charges WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM invoices WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM webhook_events WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM audit_logs WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM payment_methods WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM subscriptions WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM plan_currencies WHERE plan_id = ${planId}`;
    await sql`DELETE FROM dunning_policies WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM plans WHERE id = ${planId}`;
    await sql`DELETE FROM customers WHERE id = ${customerId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await closeDb();
  });

  async function setupActiveSubscription() {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    const [sub] = await sql`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end)
      VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${now}, ${periodEnd})
      RETURNING id
    `;
    subscriptionId = sub!.id;

    const idemKey = `wh_fail_idem_${Date.now()}`;
    const [inv] = await sql`
      INSERT INTO invoices (tenant_id, customer_id, subscription_id, currency, subtotal, total, amount_due, period_start, period_end, due_date, idempotency_key)
      VALUES (${tenantId}, ${customerId}, ${subscriptionId}, 'NGN', 5000, 5000, 5000, ${now}, ${periodEnd}, ${periodEnd}, ${idemKey})
      RETURNING id
    `;
    invoiceId = inv!.id;

    const [chg] = await sql`
      INSERT INTO charges (tenant_id, customer_id, invoice_id, currency, amount, status, nomba_reference)
      VALUES (${tenantId}, ${customerId}, ${invoiceId}, 'NGN', 5000, 'pending', ${transactionId})
      RETURNING id
    `;
    chargeId = chg!.id;
  }

  async function cleanupSubscription() {
    await sql`DELETE FROM dunning_attempts WHERE subscription_id = ${subscriptionId}`;
    await sql`DELETE FROM charges WHERE id = ${chargeId}`;
    await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${invoiceId}`;
    await sql`DELETE FROM invoices WHERE id = ${invoiceId}`;
    await sql`DELETE FROM subscriptions WHERE id = ${subscriptionId}`;
  }

  // ─── Happy path ───────────────────────────────────────────────────────────

  it('transitions charge to failed and subscription to past_due on valid charge.failure webhook', async () => {
    await setupActiveSubscription();

    const payload = buildChargeFailurePayload({
      transactionId,
      invoiceId,
      subscriptionId,
      tenantId,
    });
    const rawBody = JSON.stringify(payload);
    const signature = signWebhook(rawBody);

    const response = await fetch(`http://localhost:${config.PORT}/webhooks/nomba`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nomba-Signature': signature,
      },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    const result = await response.json() as { status: string };
    expect(result.status).toBe('processed');

    const charge = await sql`SELECT * FROM charges WHERE id = ${chargeId}`;
    expect(charge.length).toBe(1);
    expect(charge[0]!.status).toBe('failed');
    expect(charge[0]!.failureMessage).toBe('Card was declined by the issuer');

    const sub = await subscriptionQueries.findSubscriptionById(sql, tenantId, subscriptionId);
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe('past_due');

    const attempts = await dunningQueries.findDunningAttemptsBySubscription(sql, subscriptionId);
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0]!.status).toBe('scheduled');
    expect(attempts[0]!.invoiceId).toBe(invoiceId);

    await cleanupSubscription();
  });

  // ─── Idempotency ──────────────────────────────────────────────────────────

  it('returns already_processed for duplicate charge.failure webhook', async () => {
    await setupActiveSubscription();

    const payload = buildChargeFailurePayload({
      transactionId,
      invoiceId,
      subscriptionId,
      tenantId,
    });
    const rawBody = JSON.stringify(payload);
    const signature = signWebhook(rawBody);

    const response1 = await fetch(`http://localhost:${config.PORT}/webhooks/nomba`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nomba-Signature': signature,
      },
      body: rawBody,
    });
    expect(response1.status).toBe(200);
    const result1 = await response1.json() as { status: string };
    expect(result1.status).toBe('processed');

    const attemptCount1 = (await sql`
      SELECT COUNT(*)::int AS cnt FROM dunning_attempts WHERE subscription_id = ${subscriptionId}
    `)[0]!.cnt;

    const response2 = await fetch(`http://localhost:${config.PORT}/webhooks/nomba`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nomba-Signature': signature,
      },
      body: rawBody,
    });
    expect(response2.status).toBe(200);
    const result2 = await response2.json() as { status: string };
    expect(result2.status).toBe('already_processed');

    const attemptCount2 = (await sql`
      SELECT COUNT(*)::int AS cnt FROM dunning_attempts WHERE subscription_id = ${subscriptionId}
    `)[0]!.cnt;

    expect(attemptCount2).toBe(attemptCount1);

    await cleanupSubscription();
  });

  // ─── Invoice already paid guard ──────────────────────────────────────────

  it('does not change subscription status when invoice is already paid', async () => {
    await setupActiveSubscription();

    await sql`UPDATE invoices SET status = 'paid' WHERE id = ${invoiceId}`;

    const payload = buildChargeFailurePayload({
      transactionId,
      invoiceId,
      subscriptionId,
      tenantId,
    });
    const rawBody = JSON.stringify(payload);
    const signature = signWebhook(rawBody);

    const response = await fetch(`http://localhost:${config.PORT}/webhooks/nomba`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nomba-Signature': signature,
      },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    const result = await response.json() as { status: string };
    expect(result.status).toBe('processed');

    const sub = await subscriptionQueries.findSubscriptionById(sql, tenantId, subscriptionId);
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe('active');

    const attempts = await dunningQueries.findDunningAttemptsBySubscription(sql, subscriptionId);
    expect(attempts.length).toBe(0);

    await cleanupSubscription();
  });

  // ─── Charge already failed guard ─────────────────────────────────────────

  it('does not re-trigger side effects when charge is already failed', async () => {
    await setupActiveSubscription();

    await sql`UPDATE charges SET status = 'failed' WHERE id = ${chargeId}`;

    const payload = buildChargeFailurePayload({
      transactionId,
      invoiceId,
      subscriptionId,
      tenantId,
    });
    const rawBody = JSON.stringify(payload);
    const signature = signWebhook(rawBody);

    await fetch(`http://localhost:${config.PORT}/webhooks/nomba`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nomba-Signature': signature,
      },
      body: rawBody,
    });

    const sub = await subscriptionQueries.findSubscriptionById(sql, tenantId, subscriptionId);
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe('active');

    const attempts = await dunningQueries.findDunningAttemptsBySubscription(sql, subscriptionId);
    expect(attempts.length).toBe(0);

    await cleanupSubscription();
  });
});
