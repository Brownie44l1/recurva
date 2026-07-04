import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDb, closeDb } from '../../src/db/client';
import * as invoiceQueries from '../../src/db/queries/invoice.queries';
import { buildInvoice } from '../../src/domain/invoice/invoice.service';

function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

describe('VAT Billing Integration', () => {
  let sql: ReturnType<typeof getDb>;
  let tenantId: string;
  let customerId: string;
  let planId: string;

  beforeAll(async () => {
    sql = getDb();
    const ts = String(Date.now());
    const [tenant] = await sql`
      INSERT INTO tenants (name, email, nomba_account_id, webhook_secret, mode, tax_exempt, annual_turnover)
      VALUES ('VAT Test Tenant', ${'vat-test-' + ts + '@example.com'}, 'acc_vat', 'whsec_vat', 'test', false, 100000000)
      RETURNING id
    `;
    tenantId = tenant!.id;

    const [customer] = await sql`
      INSERT INTO customers (tenant_id, email, name, currency)
      VALUES (${tenantId}, 'vat-customer@example.com', 'VAT Customer', 'NGN')
      RETURNING id
    `;
    customerId = customer!.id;

    const [plan] = await sql`
      INSERT INTO plans (tenant_id, name, description, billing_type, interval, interval_count, trial_days)
      VALUES (${tenantId}, 'VAT Test Plan', 'Plan for VAT tests', 'fixed', 'month', 1, 0)
      RETURNING id
    `;
    planId = plan!.id;

    await sql`
      INSERT INTO plan_currencies (plan_id, currency, amount, unit_amount)
      VALUES (${planId}, 'NGN', 10000, 0)
    `;
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

  it('builds invoice with 7.5% VAT for non-exempt tenant', async () => {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    const [sub] = await sql`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end)
      VALUES (${tenantId}, ${customerId}, ${planId}, 'NGN', 'active', ${now}, ${periodEnd})
      RETURNING id
    `;

    const invoice = await buildInvoice(sql, tenantId, {
      id: sub!.id,
      customerId,
      planId,
      currency: 'NGN',
      couponId: null,
      creditBalance: 0,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });

    expect(toNum(invoice.subtotal)).toBe(10000);
    expect(toNum(invoice.taxAmount)).toBe(750);
    expect(invoice.taxRate).toBe(0.075);
    expect(invoice.taxExemptionReason).toBeNull();
    expect(toNum(invoice.total)).toBe(10750);
    expect(toNum(invoice.amountDue)).toBe(10750);

    const lineItemTypes = invoice.lineItems.map((li) => li.type);
    expect(lineItemTypes).toContain('tax');

    const taxLineItem = invoice.lineItems.find((li) => li.type === 'tax');
    expect(toNum(taxLineItem!.amount)).toBe(750);
    expect(taxLineItem!.description).toContain('7.5%');

    await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${invoice.id}`;
    await sql`DELETE FROM invoices WHERE id = ${invoice.id}`;
    await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
  });

  it('builds invoice with zero VAT for tax-exempt tenant', async () => {
    const ts = String(Date.now());
    const [exemptTenant] = await sql`
      INSERT INTO tenants (name, email, nomba_account_id, webhook_secret, mode, tax_exempt, annual_turnover)
      VALUES ('VAT Exempt Tenant', ${'vat-exempt-' + ts + '@example.com'}, 'acc_vat_ex', 'whsec_vat_ex', 'test', true, null)
      RETURNING id
    `;
    const exemptTenantId = exemptTenant!.id;

    const [customer] = await sql`
      INSERT INTO customers (tenant_id, email, name, currency)
      VALUES (${exemptTenantId}, 'vat-exempt-customer@example.com', 'VAT Exempt Customer', 'NGN')
      RETURNING id
    `;
    const exemptCustomerId = customer!.id;

    const [plan] = await sql`
      INSERT INTO plans (tenant_id, name, description, billing_type, interval, interval_count, trial_days)
      VALUES (${exemptTenantId}, 'VAT Exempt Plan', 'Plan for exempt tests', 'fixed', 'month', 1, 0)
      RETURNING id
    `;
    const exemptPlanId = plan!.id;

    await sql`
      INSERT INTO plan_currencies (plan_id, currency, amount, unit_amount)
      VALUES (${exemptPlanId}, 'NGN', 5000, 0)
    `;

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    const [sub] = await sql`
      INSERT INTO subscriptions (tenant_id, customer_id, plan_id, currency, status, current_period_start, current_period_end)
      VALUES (${exemptTenantId}, ${exemptCustomerId}, ${exemptPlanId}, 'NGN', 'active', ${now}, ${periodEnd})
      RETURNING id
    `;

    const invoice = await buildInvoice(sql, exemptTenantId, {
      id: sub!.id,
      customerId: exemptCustomerId,
      planId: exemptPlanId,
      currency: 'NGN',
      couponId: null,
      creditBalance: 0,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });

    expect(toNum(invoice.subtotal)).toBe(5000);
    expect(toNum(invoice.taxAmount)).toBe(0);
    expect(invoice.taxRate).toBe(0.075);
    expect(invoice.taxExemptionReason).toBe('Tenant marked as tax exempt');
    expect(toNum(invoice.total)).toBe(5000);
    expect(toNum(invoice.amountDue)).toBe(5000);

    const taxLineItems = invoice.lineItems.filter((li) => li.type === 'tax');
    expect(taxLineItems).toHaveLength(0);

    await sql`DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ${exemptTenantId})`;
    await sql`DELETE FROM invoices WHERE tenant_id = ${exemptTenantId}`;
    await sql`DELETE FROM subscriptions WHERE id = ${sub!.id}`;
    await sql`DELETE FROM plan_currencies WHERE plan_id = ${exemptPlanId}`;
    await sql`DELETE FROM plans WHERE id = ${exemptPlanId}`;
    await sql`DELETE FROM customers WHERE id = ${exemptCustomerId}`;
    await sql`DELETE FROM tenants WHERE id = ${exemptTenantId}`;
  });
});
