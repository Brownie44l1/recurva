import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDb, closeDb } from '../../src/db/client';
import * as pendingCheckoutQueries from '../../src/db/queries/pending-checkout.queries';
import * as subscriptionQueries from '../../src/db/queries/subscription.queries';
import * as paymentMethodQueries from '../../src/db/queries/payment-method.queries';
import * as customerQueries from '../../src/db/queries/customer.queries';
import * as planQueries from '../../src/db/queries/plan.queries';
import { config } from '../../src/config';
import * as crypto from 'crypto';
import { createApp } from '../../src/api/app';

const NOMBA_WEBHOOK_SECRET = config.NOMBA_WEBHOOK_SECRET || 'whsec_test_nomba_secret';

function signPayload(payload: { event: string; data: any }): string {
  const canonical = [
    payload.event,
    payload.data.orderReference,
    payload.data.transactionId,
    String(payload.data.amount),
    payload.data.currency,
  ].join(':');
  return crypto.createHmac('sha256', NOMBA_WEBHOOK_SECRET).update(canonical).digest('hex');
}

describe('Nomba Checkout Callback Integration', () => {
  let sql: ReturnType<typeof getDb>;
  let tenantId: string;
  let customerId: string;
  let planId: string;
  let subscriptionId: string;
  let orderReference: string;
  let server: any;

  beforeAll(async () => {
    server = Bun.serve({
      port: config.PORT,
      fetch: createApp().fetch,
    });

    sql = getDb();
    const [tenant] = await sql`
      INSERT INTO tenants (name, email, nomba_account_id, webhook_secret)
      VALUES ('Test Tenant', 'test-nomba-cb@example.com', 'acc_test', 'whsec_test_nomba_secret')
      RETURNING id
    `;
    tenantId = tenant!.id;

    const [customer] = await sql`
      INSERT INTO customers (tenant_id, email, name, currency)
      VALUES (${tenantId}, 'cb-customer@example.com', 'CB Customer', 'NGN')
      RETURNING id
    `;
    customerId = customer!.id;

    const [plan] = await sql`
      INSERT INTO plans (tenant_id, name, description, billing_type, interval, interval_count, trial_days)
      VALUES (${tenantId}, 'Test Plan', 'A test plan', 'fixed', 'month', 1, 0)
      RETURNING id
    `;
    planId = plan!.id;

    await sql`
      INSERT INTO plan_currencies (plan_id, currency, amount, unit_amount)
      VALUES (${planId}, 'NGN', 5000, 0)
    `;

    const [sub] = await sql`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end)
      VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'incomplete', NOW(), NOW() + INTERVAL '30 days')
      RETURNING id
    `;
    subscriptionId = sub!.id;

    orderReference = `ref_cb_test_${Date.now()}`;

    await pendingCheckoutQueries.insertPendingCheckout(sql, {
      tenantId,
      subscriptionId,
      customerId,
      orderReference,
      amount: 5000,
      currency: 'NGN',
    });
  });

  afterAll(async () => {
    server.stop();
    await sql`DELETE FROM pending_checkouts WHERE order_reference = ${orderReference}`;
    await sql`DELETE FROM subscriptions WHERE id = ${subscriptionId}`;
    await sql`DELETE FROM plan_currencies WHERE plan_id = ${planId}`;
    await sql`DELETE FROM plans WHERE id = ${planId}`;
    await sql`DELETE FROM audit_logs WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM payment_methods WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM webhook_events WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM customers WHERE id = ${customerId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await closeDb();
  });

  it('activates subscription on valid checkout callback', async () => {
    const data = {
      orderReference,
      status: 'success' as const,
      token: 'tok_integration_test',
      last4: '1234',
      cardBrand: 'visa',
      expMonth: 12,
      expYear: 2029,
      amount: 5000,
      currency: 'NGN',
      transactionId: 'txn_integration_test',
    };

    const payload = { event: 'checkout.completed', data };
    const signature = signPayload(payload);

    const response = await fetch(`http://localhost:${config.PORT}/webhooks/nomba/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'nomba-signature': signature,
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    const result = await response.json() as { status: string; paymentMethodId: string };
    expect(result.status).toBe('processed');
    expect(result.paymentMethodId).toBeTruthy();

    const sub = await subscriptionQueries.findSubscriptionById(sql, tenantId, subscriptionId);
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe('active');
    expect(sub!.paymentMethodId).toBe(result.paymentMethodId);
  });

  it('is idempotent on duplicate callback', async () => {
    const data = {
      orderReference,
      status: 'success' as const,
      token: 'tok_integration_test_dup',
      last4: '5678',
      cardBrand: 'mastercard',
      expMonth: 6,
      expYear: 2030,
      amount: 5000,
      currency: 'NGN',
      transactionId: 'txn_integration_test_dup',
    };

    const payload = { event: 'checkout.completed', data };
    const signature = signPayload(payload);

    const response = await fetch(`http://localhost:${config.PORT}/webhooks/nomba/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'nomba-signature': signature,
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    const result = await response.json() as { status: string };
    expect(result.status).toBe('already_processed');
  });
});
