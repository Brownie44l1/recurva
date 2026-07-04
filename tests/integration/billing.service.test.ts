import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';

mock.module('../../src/infrastructure/email/email.client', () => ({
  createEmailClient: mock(() => ({
    send: mock(async () => ({ id: 'mock-email-id', to: ['test@example.com'], from: 'test@example.com', subject: 'Test' })),
  })),
}));

mock.module('../../src/infrastructure/email/email.service', () => ({
  createEmailService: mock(() => ({
    send: mock(async () => ({ id: 'mock-email-id', to: ['test@example.com'], from: 'test@example.com', subject: 'Test' })),
    sendPaymentReceipt: mock(async () => ({ id: 'mock-email-id', to: ['test@example.com'], from: 'test@example.com', subject: 'Payment receipt' })),
    sendPaymentFailedEmail: mock(async () => ({ id: 'mock-email-id', to: ['test@example.com'], from: 'test@example.com', subject: 'Payment failed' })),
    sendWelcomeEmail: mock(async () => ({ id: 'mock-email-id', to: [], from: '', subject: '' })),
    sendVerificationEmail: mock(async () => ({ id: 'mock-email-id', to: [], from: '', subject: '' })),
    sendPasswordResetEmail: mock(async () => ({ id: 'mock-email-id', to: [], from: '', subject: '' })),
    sendSubscriptionCreatedEmail: mock(async () => ({ id: 'mock-email-id', to: [], from: '', subject: '' })),
  })),
}));

import { getDb, closeDb } from '../../src/db/client';
import * as invoiceQueries from '../../src/db/queries/invoice.queries';
import * as subscriptionQueries from '../../src/db/queries/subscription.queries';
import * as dunningQueries from '../../src/db/queries/dunning.queries';
import { billSubscription, retryCharge } from '../../src/domain/billing/billing.service';
import type { Subscription } from '../../src/domain/subscription/subscription.types';

function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

describe('Billing Service - billSubscription', () => {
  let sql: ReturnType<typeof getDb>;
  let tenantId: string;
  let customerId: string;
  let planId: string;
  let pmId: string;

  beforeAll(async () => {
    sql = getDb();
    const [tenant] = await sql`
      INSERT INTO tenants (name, email, nomba_account_id, webhook_secret, mode)
      VALUES ('Billing Service Test', 'billing-svc-test@example.com', 'acc_bsvc', 'whsec_bsvc', 'test')
      RETURNING id
    `;
    tenantId = tenant!.id;

    const [customer] = await sql`
      INSERT INTO customers (tenant_id, email, name, currency)
      VALUES (${tenantId}, 'billing-svc-customer@example.com', 'Billing Svc Customer', 'NGN')
      RETURNING id
    `;
    customerId = customer!.id;

    const [plan] = await sql`
      INSERT INTO plans (tenant_id, name, description, billing_type, interval, interval_count, trial_days)
      VALUES (${tenantId}, 'Billing Svc Plan', 'A plan for billing service tests', 'fixed', 'month', 1, 0)
      RETURNING id
    `;
    planId = plan!.id;

    await sql`
      INSERT INTO plan_currencies (plan_id, currency, amount, unit_amount)
      VALUES (${planId}, 'NGN', 5000, 0)
    `;

    const [pm] = await sql`
      INSERT INTO payment_methods (tenant_id, customer_id, nomba_token, card_last4, card_brand, card_exp_month, card_exp_year, is_primary)
      VALUES (${tenantId}, ${customerId}, 'tok_test', '4242', 'visa', 12, 2028, TRUE)
      RETURNING id
    `;
    pmId = pm!.id;
  });

  afterAll(async () => {
    await sql`DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM charges WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM invoices WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM dunning_attempts WHERE subscription_id IN (SELECT id FROM subscriptions WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM subscriptions WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM plan_currencies WHERE plan_id = ${planId}`;
    await sql`DELETE FROM plans WHERE id = ${planId}`;
    await sql`DELETE FROM payment_methods WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM audit_logs WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM customers WHERE id = ${customerId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await closeDb();
  });

  it('happy path: builds invoice, charges card, advances period, marks invoice paid', async () => {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    const [sub] = await sql<Subscription[]>`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, payment_method_id, current_period_start, current_period_end)
      VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${pmId}, ${now}, ${periodEnd})
      RETURNING *
    `;

    mock.module('../../src/domain/payment/payment.factory', () => ({
      getPaymentProcessor: mock(() => ({
        charge: mock(async () => ({
          status: 'succeeded',
          chargeId: 'nomba-charge-1',
          transactionId: 'nomba-txn-1',
          amount: 5000,
          currency: 'NGN',
        })),
        createCheckout: mock(async () => ({ checkoutUrl: '', orderReference: '', status: 'success' })),
        refund: mock(async () => ({ refundId: '', status: 'succeeded', amount: 0 })),
        supportsCurrency: mock(() => true),
      })),
    }));

    const result = await billSubscription(sql, tenantId, sub!.id, {
      actorType: 'system',
      actorId: 'test',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('paid');
    expect(result.invoiceId).toBeTruthy();
    expect(typeof result.invoiceId).toBe('string');

    const invoice = await invoiceQueries.findInvoiceById(sql, tenantId, result.invoiceId);
    expect(invoice?.status).toBe('paid');
    expect(toNum(invoice!.amountPaid)).toBe(5000);

    const updated = await subscriptionQueries.findSubscriptionById(sql, tenantId, sub!.id);
    expect(updated?.currentPeriodStart.getTime()).toBeGreaterThan(now.getTime());

    await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${result.invoiceId}`;
    await sql`DELETE FROM charges WHERE invoice_id = ${result.invoiceId}`;
    await sql`DELETE FROM invoices WHERE id = ${result.invoiceId}`;
    await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
  });

  it('transitions to PAYMENT_FAILED when no payment method on file', async () => {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    const [sub] = await sql<Subscription[]>`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end)
      VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${now}, ${periodEnd})
      RETURNING *
    `;

    const result = await billSubscription(sql, tenantId, sub!.id, {
      actorType: 'system',
      actorId: 'test',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('dunning');
    expect(result.chargeId).toBeNull();

    const updated = await subscriptionQueries.findSubscriptionById(sql, tenantId, sub!.id);
    expect(updated?.status).toBe('past_due');

    const dunningAttempts = await dunningQueries.findDunningAttemptsBySubscription(sql, sub!.id);
    expect(dunningAttempts.length).toBeGreaterThan(0);

    await sql`DELETE FROM dunning_attempts WHERE subscription_id = ${sub!.id}`;
    await sql`DELETE FROM invoices WHERE id = ${result.invoiceId}`;
    await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
  });

  it('zero-amount invoice: marks paid, advances period, does not call Nomba', async () => {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    const [sub] = await sql<Subscription[]>`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, payment_method_id, current_period_start, current_period_end, credit_balance)
      VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${pmId}, ${now}, ${periodEnd}, 10000)
      RETURNING *
    `;

    let nombaCalled = false;
    mock.module('../../src/domain/payment/payment.factory', () => ({
      getPaymentProcessor: mock(() => ({
        charge: mock(async () => {
          nombaCalled = true;
          return { status: 'succeeded', chargeId: '', transactionId: '', amount: 0, currency: 'NGN' };
        }),
        createCheckout: mock(async () => ({ checkoutUrl: '', orderReference: '', status: 'success' })),
        refund: mock(async () => ({ refundId: '', status: 'succeeded', amount: 0 })),
        supportsCurrency: mock(() => true),
      })),
    }));

    const result = await billSubscription(sql, tenantId, sub!.id, {
      actorType: 'system',
      actorId: 'test',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('paid');

    const invoice = await invoiceQueries.findInvoiceById(sql, tenantId, result.invoiceId);
    expect(toNum(invoice!.amountDue)).toBe(0);
    expect(invoice?.status).toBe('paid');
    expect(nombaCalled).toBe(false);

    const updatedSub = await subscriptionQueries.findSubscriptionById(sql, tenantId, sub!.id);
    expect(updatedSub?.currentPeriodStart.getTime()).toBeGreaterThan(now.getTime());

    await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${result.invoiceId}`;
    await sql`DELETE FROM invoices WHERE id = ${result.invoiceId}`;
    await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
  });

  it('handles Nomba charge failure: transitions to past_due, initiates dunning', async () => {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    const [sub] = await sql<Subscription[]>`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, payment_method_id, current_period_start, current_period_end)
      VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${pmId}, ${now}, ${periodEnd})
      RETURNING *
    `;

    mock.module('../../src/domain/payment/payment.factory', () => ({
      getPaymentProcessor: mock(() => ({
        charge: mock(async () => {
          throw new Error('Card declined');
        }),
        createCheckout: mock(async () => ({ checkoutUrl: '', orderReference: '', status: 'success' })),
        refund: mock(async () => ({ refundId: '', status: 'succeeded', amount: 0 })),
        supportsCurrency: mock(() => true),
      })),
    }));

    const result = await billSubscription(sql, tenantId, sub!.id, {
      actorType: 'system',
      actorId: 'test',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('dunning');

    const charges = await sql`SELECT * FROM charges WHERE invoice_id = ${result.invoiceId}`;
    expect((charges as any[])[0]?.status).toBe('failed');

    const updated = await subscriptionQueries.findSubscriptionById(sql, tenantId, sub!.id);
    expect(updated?.status).toBe('past_due');

    await sql`DELETE FROM dunning_attempts WHERE subscription_id = ${sub!.id}`;
    await sql`DELETE FROM charges WHERE invoice_id = ${result.invoiceId}`;
    await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${result.invoiceId}`;
    await sql`DELETE FROM invoices WHERE id = ${result.invoiceId}`;
    await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
  });

  it('decrements credit balance exactly once on successful charge', async () => {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    const [sub] = await sql<Subscription[]>`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, payment_method_id, current_period_start, current_period_end, credit_balance)
      VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${pmId}, ${now}, ${periodEnd}, 2000)
      RETURNING *
    `;

    mock.module('../../src/domain/payment/payment.factory', () => ({
      getPaymentProcessor: mock(() => ({
        charge: mock(async () => ({
          status: 'succeeded', chargeId: 'nomba-charge-dc', transactionId: 'nomba-txn-dc', amount: 3000, currency: 'NGN',
        })),
        createCheckout: mock(async () => ({ checkoutUrl: '', orderReference: '', status: 'success' })),
        refund: mock(async () => ({ refundId: '', status: 'succeeded', amount: 0 })),
        supportsCurrency: mock(() => true),
      })),
    }));

    const result = await billSubscription(sql, tenantId, sub!.id, {
      actorType: 'system',
      actorId: 'test',
    });

    expect(result.success).toBe(true);
    expect(result.invoiceId).toBeTruthy();

    const updated = await subscriptionQueries.findSubscriptionById(sql, tenantId, sub!.id);
    expect(toNum(updated!.creditBalance)).toBe(0);

    await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${result.invoiceId}`;
    await sql`DELETE FROM charges WHERE invoice_id = ${result.invoiceId}`;
    await sql`DELETE FROM invoices WHERE id = ${result.invoiceId}`;
    await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
  });

  it('returns failure for non-existent subscription', async () => {
    const result = await billSubscription(sql, tenantId, '00000000-0000-0000-0000-000000000000', {
      actorType: 'system',
      actorId: 'test',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('Subscription not found');
  });
});

describe('Billing Service - retryCharge', () => {
  let sql: ReturnType<typeof getDb>;
  let tenantId: string;
  let customerId: string;
  let planId: string;
  let pmId: string;
  let backupPmId: string;

  beforeAll(async () => {
    sql = getDb();
    const [tenant] = await sql`
      INSERT INTO tenants (name, email, nomba_account_id, webhook_secret, mode)
      VALUES ('Retry Charge Test', 'retry-test@example.com', 'acc_retry', 'whsec_retry', 'test')
      RETURNING id
    `;
    tenantId = tenant!.id;

    const [customer] = await sql`
      INSERT INTO customers (tenant_id, email, name, currency)
      VALUES (${tenantId}, 'retry-customer@example.com', 'Retry Customer', 'NGN')
      RETURNING id
    `;
    customerId = customer!.id;

    const [plan] = await sql`
      INSERT INTO plans (tenant_id, name, description, billing_type, interval, interval_count, trial_days)
      VALUES (${tenantId}, 'Retry Plan', 'A plan for retry tests', 'fixed', 'month', 1, 0)
      RETURNING id
    `;
    planId = plan!.id;

    await sql`
      INSERT INTO plan_currencies (plan_id, currency, amount, unit_amount)
      VALUES (${planId}, 'NGN', 5000, 0)
    `;

    const [pm] = await sql`
      INSERT INTO payment_methods (tenant_id, customer_id, nomba_token, card_last4, card_brand, card_exp_month, card_exp_year, is_primary)
      VALUES (${tenantId}, ${customerId}, 'tok_primary', '4242', 'visa', 12, 2028, TRUE)
      RETURNING id
    `;
    pmId = pm!.id;

    const [bpm] = await sql`
      INSERT INTO payment_methods (tenant_id, customer_id, nomba_token, card_last4, card_brand, card_exp_month, card_exp_year, is_backup)
      VALUES (${tenantId}, ${customerId}, 'tok_backup', '5555', 'mc', 6, 2029, TRUE)
      RETURNING id
    `;
    backupPmId = bpm!.id;
  });

  afterAll(async () => {
    await sql`DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM charges WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM invoices WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM dunning_attempts WHERE subscription_id IN (SELECT id FROM subscriptions WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM subscriptions WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM plan_currencies WHERE plan_id = ${planId}`;
    await sql`DELETE FROM plans WHERE id = ${planId}`;
    await sql`DELETE FROM payment_methods WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM audit_logs WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM customers WHERE id = ${customerId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await closeDb();
  });

  it('succeeds with primary payment method', async () => {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    const [sub] = await sql<Subscription[]>`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, payment_method_id, current_period_start, current_period_end)
      VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'past_due', ${pmId}, ${now}, ${periodEnd})
      RETURNING *
    `;

    const idemKey = `retry_test_${Date.now()}`;
    const [inv] = await sql`
      INSERT INTO invoices (tenant_id, customer_id, subscription_id, currency, subtotal, total, amount_due, period_start, period_end, due_date, idempotency_key, status)
      VALUES (${tenantId}, ${customerId}, ${sub!.id}, 'NGN', 5000, 5000, 5000, ${now}, ${periodEnd}, ${periodEnd}, ${idemKey}, 'open')
      RETURNING id
    `;

    mock.module('../../src/domain/payment/payment.factory', () => ({
      getPaymentProcessor: mock(() => ({
        charge: mock(async () => ({
          status: 'succeeded', chargeId: 'rc-charge-1', transactionId: 'rc-txn-1', amount: 5000, currency: 'NGN',
        })),
        createCheckout: mock(async () => ({ checkoutUrl: '', orderReference: '', status: 'success' })),
        refund: mock(async () => ({ refundId: '', status: 'succeeded', amount: 0 })),
        supportsCurrency: mock(() => true),
      })),
    }));

    const result = await retryCharge(sql, tenantId, inv!.id);

    expect(result.success).toBe(true);
    expect(result.status).toBe('paid');

    const invoice = await invoiceQueries.findInvoiceById(sql, tenantId, inv!.id);
    expect(invoice?.status).toBe('paid');

    await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${inv!.id}`;
    await sql`DELETE FROM charges WHERE invoice_id = ${inv!.id}`;
    await sql`DELETE FROM invoices WHERE id = ${inv!.id}`;
    await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
  });

  it('primary fails, falls back to backup payment method', async () => {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    const [sub] = await sql<Subscription[]>`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, payment_method_id, current_period_start, current_period_end)
      VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'past_due', ${pmId}, ${now}, ${periodEnd})
      RETURNING *
    `;

    await sql`
      UPDATE subscriptions SET payment_method_id = NULL WHERE id = ${sub!.id}
    `;

    const idemKey = `retry_backup_test_${Date.now()}`;
    const [inv] = await sql`
      INSERT INTO invoices (tenant_id, customer_id, subscription_id, currency, subtotal, total, amount_due, period_start, period_end, due_date, idempotency_key, status)
      VALUES (${tenantId}, ${customerId}, ${sub!.id}, 'NGN', 5000, 5000, 5000, ${now}, ${periodEnd}, ${periodEnd}, ${idemKey}, 'open')
      RETURNING id
    `;

    mock.module('../../src/domain/payment/payment.factory', () => ({
      getPaymentProcessor: mock(() => ({
        charge: mock(async () => ({
          status: 'succeeded', chargeId: 'rc-backup-charge', transactionId: 'rc-backup-txn', amount: 5000, currency: 'NGN',
        })),
        createCheckout: mock(async () => ({ checkoutUrl: '', orderReference: '', status: 'success' })),
        refund: mock(async () => ({ refundId: '', status: 'succeeded', amount: 0 })),
        supportsCurrency: mock(() => true),
      })),
    }));

    const result = await retryCharge(sql, tenantId, inv!.id);

    expect(result.success).toBe(true);
    expect(result.status).toBe('paid');

    const invoice = await invoiceQueries.findInvoiceById(sql, tenantId, inv!.id);
    expect(invoice?.status).toBe('paid');

    await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${inv!.id}`;
    await sql`DELETE FROM charges WHERE invoice_id = ${inv!.id}`;
    await sql`DELETE FROM invoices WHERE id = ${inv!.id}`;
    await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
  });

  it('no backup available, primary fails -> failure surfaced', async () => {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);

    const [noPmCustomer] = await sql`
      INSERT INTO customers (tenant_id, email, name, currency)
      VALUES (${tenantId}, 'nopm-retry@example.com', 'No PM Customer', 'NGN')
      RETURNING id
    `;

    const [sub] = await sql<Subscription[]>`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end)
      VALUES (${tenantId}, ${noPmCustomer!.id}, ${planId}, 'NGN', 'past_due', ${now}, ${periodEnd})
      RETURNING *
    `;

    const idemKey = `retry_nobackup_test_${Date.now()}`;
    const [inv] = await sql`
      INSERT INTO invoices (tenant_id, customer_id, subscription_id, currency, subtotal, total, amount_due, period_start, period_end, due_date, idempotency_key, status)
      VALUES (${tenantId}, ${noPmCustomer!.id}, ${sub!.id}, 'NGN', 5000, 5000, 5000, ${now}, ${periodEnd}, ${periodEnd}, ${idemKey}, 'open')
      RETURNING id
    `;

    const result = await retryCharge(sql, tenantId, inv!.id);

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('No payment method available');

    await sql`DELETE FROM invoices WHERE id = ${inv!.id}`;
    await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
    await sql`DELETE FROM customers WHERE id = ${noPmCustomer!.id}`;
  });
});
