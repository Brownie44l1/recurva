import { describe, it, expect } from 'bun:test';
import { toNrsInvoice } from '../../../src/domain/tax/nrs-format';
import type { Invoice } from '../../../src/domain/invoice/invoice.types';

describe('NRS e-Invoice Format', () => {
  const baseInvoice: Invoice = {
    id: 'inv-12345-abcde',
    tenantId: 'tenant-1',
    customerId: 'cust-1',
    subscriptionId: 'sub-1',
    currency: 'NGN',
    status: 'paid',
    subtotal: 10000,
    discountAmount: 1000,
    taxAmount: 675,
    taxRate: 0.075,
    taxExemptionReason: null,
    total: 9675,
    amountDue: 9675,
    amountPaid: 9675,
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-01-31'),
    dueDate: new Date('2026-01-31'),
    paidAt: new Date('2026-01-15'),
    voidedAt: null,
    nombaChargeId: null,
    idempotencyKey: 'key-1',
    fxRate: null,
    settlementCurrency: null,
    settlementAmount: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-15'),
    lineItems: [
      {
        id: 'li-1',
        invoiceId: 'inv-12345-abcde',
        type: 'subscription',
        description: 'Premium Plan (NGN)',
        quantity: 1,
        unitAmount: 10000,
        amount: 10000,
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'li-2',
        invoiceId: 'inv-12345-abcde',
        type: 'credit',
        description: 'Coupon discount',
        quantity: 1,
        unitAmount: -1000,
        amount: -1000,
        periodStart: null,
        periodEnd: null,
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'li-3',
        invoiceId: 'inv-12345-abcde',
        type: 'tax',
        description: 'VAT at 7.5%',
        quantity: 1,
        unitAmount: 675,
        amount: 675,
        periodStart: null,
        periodEnd: null,
        createdAt: new Date('2026-01-01'),
      },
    ],
  };

  const tenant = { name: 'Acme Corp', email: 'billing@acme.com' };
  const customer = { name: 'Jane Doe', email: 'jane@example.com' };

  it('generates NRS invoice with correct structure', () => {
    const nrs = toNrsInvoice(baseInvoice, tenant, customer);

    expect(nrs.invoiceNumber).toBe('INV-1234');
    expect(nrs.invoiceDate).toBe('2026-01-01');
    expect(nrs.supplier.name).toBe('Acme Corp');
    expect(nrs.customer.name).toBe('Jane Doe');
    expect(nrs.customer.email).toBe('jane@example.com');
    expect(nrs.currency).toBe('NGN');
  });

  it('excludes tax and credit line items from net line items', () => {
    const nrs = toNrsInvoice(baseInvoice, tenant, customer);
    expect(nrs.lineItems).toHaveLength(1);
    expect(nrs.lineItems[0]!.description).toBe('Premium Plan (NGN)');
    expect(nrs.lineItems[0]!.netAmount).toBe(10000);
  });

  it('computes correct tax summary', () => {
    const nrs = toNrsInvoice(baseInvoice, tenant, customer);
    expect(nrs.taxSummary).toHaveLength(1);
    expect(nrs.taxSummary[0]!.taxRate).toBe('7.5%');
    expect(nrs.taxSummary[0]!.taxableAmount).toBe(10000);
    expect(nrs.taxSummary[0]!.taxAmount).toBe(675);
  });

  it('computes correct totals', () => {
    const nrs = toNrsInvoice(baseInvoice, tenant, customer);
    expect(nrs.totals.netTotal).toBe(10000);
    expect(nrs.totals.taxTotal).toBe(675);
    expect(nrs.totals.grossTotal).toBe(10675);
  });

  it('handles zero tax rate', () => {
    const exemptInvoice: Invoice = {
      ...baseInvoice,
      taxAmount: 0,
      taxRate: null,
      taxExemptionReason: 'Below turnover threshold',
    };

    const nrs = toNrsInvoice(exemptInvoice, tenant, customer);
    expect(nrs.taxSummary[0]!.taxRate).toBe('0.0%');
    expect(nrs.taxSummary[0]!.taxAmount).toBe(0);
    expect(nrs.totals.taxTotal).toBe(0);
    expect(nrs.totals.grossTotal).toBe(10000);
  });
});
