import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDb, closeDb } from '../../src/db/client';
import * as subscriptionQueries from '../../src/db/queries/subscription.queries';
import * as invoiceQueries from '../../src/db/queries/invoice.queries';
import * as dunningQueries from '../../src/db/queries/dunning.queries';
import { initiateDunning } from '../../src/domain/dunning/dunning.service';
import { buildInvoice, voidInvoice } from '../../src/domain/invoice/invoice.service';
import { transitionState } from '../../src/domain/subscription/subscription.service';
import { executeSideEffects } from '../../src/domain/subscription/side-effect.dispatcher';
import { applyTransition } from '../../src/domain/subscription/subscription.state-machine';
import type { Subscription } from '../../src/domain/subscription/subscription.types';

function n(v: unknown): number {
  return typeof v === 'string' ? parseInt(v as string, 10) : Number(v);
}

describe('Billing Lifecycle Integration', () => {
  let sql: ReturnType<typeof getDb>;
  let tenantId: string;
  let customerId: string;
  let planId: string;

  beforeAll(async () => {
    sql = getDb();

    const [tenant] = await sql`
      INSERT INTO tenants (name, email, nomba_account_id, webhook_secret, mode)
      VALUES ('Billing Test', 'billing-test@example.com', 'acc_test', 'whsec_test', 'test')
      RETURNING id
    `;
    tenantId = tenant!.id;

    const [customer] = await sql`
      INSERT INTO customers (tenant_id, email, name, currency)
      VALUES (${tenantId}, 'billing-customer@example.com', 'Billing Customer', 'NGN')
      RETURNING id
    `;
    customerId = customer!.id;

    const [plan] = await sql`
      INSERT INTO plans (tenant_id, name, description, billing_type, interval, interval_count, trial_days)
      VALUES (${tenantId}, 'Billing Test Plan', 'A plan for billing tests', 'fixed', 'month', 1, 0)
      RETURNING id
    `;
    planId = plan!.id;

    await sql`
      INSERT INTO plan_currencies (plan_id, currency, amount, unit_amount)
      VALUES (${planId}, 'NGN', 5000, 0)
    `;
  });

  afterAll(async () => {
    await sql`DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM charges WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM invoices WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM dunning_attempts WHERE subscription_id IN (SELECT id FROM subscriptions WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM coupon_redemptions WHERE subscription_id IN (SELECT id FROM subscriptions WHERE tenant_id = ${tenantId})`;
    await sql`DELETE FROM subscriptions WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM plan_currencies WHERE plan_id = ${planId}`;
    await sql`DELETE FROM plans WHERE id = ${planId}`;
    await sql`DELETE FROM payment_methods WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM audit_logs WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM customers WHERE id = ${customerId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await closeDb();
  });

  describe('amount_paid', () => {
    it('sets amount_paid = amount_due when invoice transitions to paid', async () => {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 86400000);
      const [sub] = await sql<Subscription[]>`
        INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end)
        VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${now}, ${periodEnd})
        RETURNING *
      `;

      const invoice = await buildInvoice(sql, tenantId, sub!, {
        periodStart: sub!.currentPeriodStart,
        periodEnd: sub!.currentPeriodEnd,
        applyCoupon: false,
      });

      expect(n(invoice.amountDue)).toBe(5000);
      expect(n(invoice.amountPaid)).toBe(0);

      const updated = await invoiceQueries.updateInvoiceStatus(sql, invoice.id, 'paid');
      expect(n(updated.amountPaid)).toBe(5000);

      const [lineItems] = await sql`SELECT COUNT(*)::int AS cnt FROM invoice_line_items WHERE invoice_id = ${invoice.id}`;
      await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${invoice.id}`;
      await sql`DELETE FROM invoices WHERE id = ${invoice.id}`;
      await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
    });
  });

  describe('credit balance deferral', () => {
    it('does not decrement credit balance at invoice creation', async () => {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 86400000);
      const [sub] = await sql<Subscription[]>`
        INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end, credit_balance)
        VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${now}, ${periodEnd}, 10000)
        RETURNING *
      `;

      expect(n(sub!.creditBalance)).toBe(10000);

      await buildInvoice(sql, tenantId, sub!, {
        periodStart: sub!.currentPeriodStart,
        periodEnd: sub!.currentPeriodEnd,
        applyCoupon: false,
      });

      const afterBuild = await subscriptionQueries.findSubscriptionById(sql, tenantId, sub!.id);
      expect(n(afterBuild!.creditBalance)).toBe(10000);

      await sql`DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE subscription_id = ${sub!.id})`;
      await sql`DELETE FROM invoices WHERE subscription_id = ${sub!.id}`;
      await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
    });

    it('decrements credit balance when invoice is paid', async () => {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 86400000);
      const [sub] = await sql<Subscription[]>`
        INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end, credit_balance)
        VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${now}, ${periodEnd}, 10000)
        RETURNING *
      `;

      const invoice = await buildInvoice(sql, tenantId, sub!, {
        periodStart: sub!.currentPeriodStart,
        periodEnd: sub!.currentPeriodEnd,
        applyCoupon: false,
      });

      await invoiceQueries.updateInvoiceStatus(sql, invoice.id, 'paid');
      const creditUsed = n(invoice.total) - n(invoice.amountDue);
      if (creditUsed > 0) {
        await subscriptionQueries.decrementCreditBalance(sql, sub!.id, creditUsed);
      }

      const afterPayment = await subscriptionQueries.findSubscriptionById(sql, tenantId, sub!.id);
      expect(n(afterPayment!.creditBalance)).toBe(5000);

      await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${invoice.id}`;
      await sql`DELETE FROM invoices WHERE id = ${invoice.id}`;
      await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
    });

    it('restores credit balance when a paid invoice with credit is voided', async () => {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 86400000);
      const [sub] = await sql<Subscription[]>`
        INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end, credit_balance)
        VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${now}, ${periodEnd}, 10000)
        RETURNING *
      `;

      const invoice = await buildInvoice(sql, tenantId, sub!, {
        periodStart: sub!.currentPeriodStart,
        periodEnd: sub!.currentPeriodEnd,
        applyCoupon: false,
      });

      await invoiceQueries.updateInvoiceStatus(sql, invoice.id, 'paid');
      const creditUsed = n(invoice.total) - n(invoice.amountDue);
      if (creditUsed > 0) {
        await subscriptionQueries.decrementCreditBalance(sql, sub!.id, creditUsed);
      }

      await voidInvoice(sql, tenantId, invoice.id);

      const afterVoid = await subscriptionQueries.findSubscriptionById(sql, tenantId, sub!.id);
      expect(n(afterVoid!.creditBalance)).toBe(10000);

      await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${invoice.id}`;
      await sql`DELETE FROM invoices WHERE id = ${invoice.id}`;
      await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
    });
  });

  describe('state machine', () => {
    it('allows PAYMENT_SUCCESS from active state', () => {
      const result = applyTransition('active', 'PAYMENT_SUCCESS');
      expect(result.nextState).toBe('active');
    });

    it('advances past_due to active on PAYMENT_SUCCESS then stays active', () => {
      const step1 = applyTransition('past_due', 'PAYMENT_SUCCESS');
      expect(step1.nextState).toBe('active');

      const step2 = applyTransition('active', 'PAYMENT_SUCCESS');
      expect(step2.nextState).toBe('active');
    });
  });

  describe('billing cycle includes past_due', () => {
    it('findDueForBilling returns past_due subscriptions', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 86400000);
      const [sub] = await sql<Subscription[]>`
        INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end)
        VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'past_due', ${past}, ${now})
        RETURNING *
      `;

      const due = await subscriptionQueries.findDueForBilling(sql, new Date(now.getTime() + 3600000));
      const found = due.some((s) => s.id === sub!.id);
      expect(found).toBe(true);

      await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
    });
  });

  describe('side effects', () => {
    it('CANCEL_IMMEDIATELY clears scheduled dunning attempts', async () => {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 86400000);
      const [sub] = await sql<Subscription[]>`
        INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end)
        VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'incomplete', ${now}, ${periodEnd})
        RETURNING *
      `;

      const idemKey = `test_dunning_sf_${sub!.id}`;
      const [inv] = await sql`
        INSERT INTO invoices (tenant_id, customer_id, subscription_id, currency, subtotal, total, amount_due, period_start, period_end, due_date, idempotency_key)
        VALUES (${tenantId}, ${customerId}, ${sub!.id}, 'NGN', 5000, 5000, 5000, ${now}, ${periodEnd}, ${periodEnd}, ${idemKey})
        RETURNING id
      `;

      await sql`
        INSERT INTO dunning_attempts (subscription_id, invoice_id, attempt_number, scheduled_at)
        VALUES (${sub!.id}::uuid, ${inv!.id}::uuid, 1, ${new Date(now.getTime() + 86400000)})
      `;
      await sql`
        INSERT INTO dunning_attempts (subscription_id, invoice_id, attempt_number, scheduled_at)
        VALUES (${sub!.id}::uuid, ${inv!.id}::uuid, 2, ${new Date(now.getTime() + 172800000)})
      `;

      const { subscription: updated, sideEffects } = await transitionState(sql, tenantId, sub!.id, 'CANCEL', {
        actorType: 'system',
        actorId: 'test',
      });
      expect(updated.status).toBe('cancelled');

      await executeSideEffects(sql, tenantId, updated, sideEffects, { actorType: 'system', actorId: 'test' });

      const remaining = await sql<{ status: string }[]>`
        SELECT status FROM dunning_attempts WHERE subscription_id = ${sub!.id}
      `;
      expect(remaining.length).toBe(2);
      for (const row of remaining) {
        expect(row.status).not.toBe('scheduled');
      }

      await sql`DELETE FROM dunning_attempts WHERE subscription_id = ${sub!.id}`;
      await sql`DELETE FROM invoices WHERE id = ${inv!.id}`;
      await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
    });
  });

  describe('dunning uniqueness', () => {
    it('initiateDunning does not create duplicate rows when called twice for same subscription+invoice', async () => {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 86400000);
      const [sub] = await sql`
        INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end)
        VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${now}, ${periodEnd})
        RETURNING id
      `;

      const idemKey = `test_dunning_dup_${Date.now()}`;
      const [inv] = await sql`
        INSERT INTO invoices (tenant_id, customer_id, subscription_id, currency, subtotal, total, amount_due, period_start, period_end, due_date, idempotency_key)
        VALUES (${tenantId}, ${customerId}, ${sub!.id}, 'NGN', 5000, 5000, 5000, ${now}, ${periodEnd}, ${periodEnd}, ${idemKey})
        RETURNING id
      `;

      const firstResult = await initiateDunning(sql, tenantId, sub!.id, inv!.id);
      expect(firstResult.length).toBeGreaterThan(0);

      const secondResult = await initiateDunning(sql, tenantId, sub!.id, inv!.id);
      expect(secondResult.length).toBe(firstResult.length);

      const allRows = await dunningQueries.findDunningAttemptsBySubscription(sql, sub!.id);
      expect(allRows.length).toBe(firstResult.length);

      await sql`DELETE FROM dunning_attempts WHERE subscription_id = ${sub!.id}`;
      await sql`DELETE FROM invoices WHERE id = ${inv!.id}`;
      await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
    });
  });
});
