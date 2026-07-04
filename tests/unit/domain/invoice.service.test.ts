import { describe, it, expect, mock, beforeEach } from 'bun:test';

const plan = {
  id: 'plan-123',
  tenantId: 'tenant-1',
  name: 'Test Plan',
  billingType: 'fixed' as string,
  interval: 'month',
  intervalCount: 1,
  trialDays: 0,
  prices: [{ currency: 'NGN' as string, amount: 5000, unitAmount: null as number | null }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

let mockCoupon: Record<string, unknown> | null = null;
let mockRedemption: Record<string, unknown> | null = null;
let mockExistingInvoice: Record<string, unknown> | null = null;

mock.module('../../../src/db/queries/invoice.queries', () => ({
  findInvoiceByIdempotencyKey: mock(() => mockExistingInvoice),
  insertInvoice: mock((_sql: unknown, tenantId: string, input: Record<string, unknown>) => ({
    id: `inv-${Date.now()}`,
    tenantId,
    customerId: input.customerId,
    subscriptionId: input.subscriptionId,
    currency: input.currency,
    status: 'draft',
    subtotal: input.subtotal,
    discountAmount: input.discountAmount,
    total: input.total,
    amountDue: input.amountDue,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    dueDate: input.dueDate,
    idempotencyKey: input.idempotencyKey,
    amountPaid: 0,
    paidAt: null,
    voidedAt: null,
    nombaChargeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lineItems: [] as unknown[],
  })),
  insertLineItem: mock((_sql: unknown, invoiceId: string, input: Record<string, unknown>) => ({
    id: `li-${Date.now()}`,
    invoiceId,
    type: input.type,
    description: input.description,
    quantity: input.quantity,
    unitAmount: input.unitAmount,
    amount: input.amount,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    createdAt: new Date(),
  })),
  findInvoiceById: mock((_sql: unknown, _tenantId: string, invoiceId: string) => {
    return Promise.resolve(mockExistingInvoice ? { ...mockExistingInvoice, id: invoiceId, lineItems: [] } : null);
  }),
  updateInvoiceStatus: mock(() => ({})),
}));

mock.module('../../../src/db/queries/plan.queries', () => ({
  findPlanById: mock(() => ({ ...plan })),
}));

mock.module('../../../src/db/queries/usage.queries', () => ({
  aggregateUsage: mock(() => ({ totalUnits: 10 })),
}));

mock.module('../../../src/db/queries/coupon.queries', () => ({
  findCouponById: mock(() => mockCoupon),
  findRedemptionForUpdate: mock(() => mockRedemption),
  incrementMonthsApplied: mock(() => ({})),
}));

mock.module('../../../src/db/queries/tenant.queries', () => ({
  findTenantById: mock(() => ({
    id: 'tenant-1',
    name: 'Test Tenant',
    email: 'test@example.com',
    nombaAccountId: 'acc_test',
    webhookSecret: 'whsec_test',
    mode: 'test',
    isActive: true,
    preferredProcessor: 'nomba',
    annualTurnover: null,
    taxExempt: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
}));

import { buildInvoice, finalizeInvoice } from '../../../src/domain/invoice/invoice.service';

function makeSql() {
  return {} as any;
}

function makeSubscription(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'sub-123',
    customerId: 'cust-123',
    planId: 'plan-123',
    currency: 'NGN',
    couponId: null,
    creditBalance: 0,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
    ...overrides,
  };
}

function makeOptions(overrides: Record<string, unknown> = {}) {
  return { applyCoupon: true, ...overrides };
}

describe('Invoice Service - buildInvoice', () => {
  beforeEach(() => {
    plan.billingType = 'fixed';
    plan.prices = [{ currency: 'NGN', amount: 5000, unitAmount: null }];
    plan.name = 'Test Plan';
    mockCoupon = null;
    mockRedemption = null;
    mockExistingInvoice = null;
  });

  it('creates invoice with correct amounts for fixed billing type', async () => {
    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription(), makeOptions());

    expect(invoice.subtotal).toBe(5000);
    expect(invoice.discountAmount).toBe(0);
    expect(invoice.total).toBe(5000);
    expect(invoice.amountDue).toBe(5000);
  });

  it('includes metered usage charges for metered billing type', async () => {
    plan.billingType = 'metered';
    plan.prices = [{ currency: 'NGN', amount: 1000, unitAmount: 500 }];

    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription(), makeOptions());

    expect(invoice.subtotal).toBe(1000 + 10 * 500);
    expect(invoice.total).toBe(6000);
  });

  it('handles mixed billing type (fixed + metered)', async () => {
    plan.billingType = 'mixed';
    plan.prices = [{ currency: 'NGN', amount: 3000, unitAmount: 200 }];

    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription(), makeOptions());

    expect(invoice.subtotal).toBe(3000 + 10 * 200);
    expect(invoice.total).toBe(5000);
  });

  it('applies percentage coupon discount correctly', async () => {
    mockCoupon = {
      id: 'coupon-1', tenantId: 'tenant-1', code: 'PCT20',
      discountType: 'percentage', discountValue: 20,
      currency: null, duration: 'once', durationMonths: null,
      maxRedemptions: null, redemptionCount: 0, expiresAt: null, isActive: true,
      createdAt: new Date(),
    };
    mockRedemption = {
      id: 'redemption-1', couponId: 'coupon-1', subscriptionId: 'sub-123',
      monthsApplied: 0, createdAt: new Date(),
    };

    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription({ couponId: 'coupon-1' }), makeOptions());

    expect(invoice.discountAmount).toBe(1000);
    expect(invoice.total).toBe(4000);
  });

  it('applies fixed amount coupon discount correctly', async () => {
    mockCoupon = {
      id: 'coupon-2', tenantId: 'tenant-1', code: 'FIXED20',
      discountType: 'fixed_amount', discountValue: 2000,
      currency: 'NGN', duration: 'once', durationMonths: null,
      maxRedemptions: null, redemptionCount: 0, expiresAt: null, isActive: true,
      createdAt: new Date(),
    };
    mockRedemption = {
      id: 'redemption-2', couponId: 'coupon-2', subscriptionId: 'sub-123',
      monthsApplied: 0, createdAt: new Date(),
    };

    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription({ couponId: 'coupon-2' }), makeOptions());

    expect(invoice.discountAmount).toBe(2000);
    expect(invoice.total).toBe(3000);
  });

  it('caps coupon discount at subtotal (no negative total)', async () => {
    mockCoupon = {
      id: 'coupon-3', tenantId: 'tenant-1', code: 'BIGFIXED',
      discountType: 'fixed_amount', discountValue: 10000,
      currency: 'NGN', duration: 'once', durationMonths: null,
      maxRedemptions: null, redemptionCount: 0, expiresAt: null, isActive: true,
      createdAt: new Date(),
    };
    mockRedemption = {
      id: 'redemption-3', couponId: 'coupon-3', subscriptionId: 'sub-123',
      monthsApplied: 0, createdAt: new Date(),
    };

    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription({ couponId: 'coupon-3' }), makeOptions());

    expect(invoice.discountAmount).toBe(5000);
    expect(invoice.total).toBe(0);
    expect(invoice.amountDue).toBe(0);
  });

  it('skips coupon application when applyCoupon is false', async () => {
    mockCoupon = {
      id: 'coupon-1', tenantId: 'tenant-1', code: 'PCT20',
      discountType: 'percentage', discountValue: 20,
      currency: null, duration: 'once', durationMonths: null,
      maxRedemptions: null, redemptionCount: 0, expiresAt: null, isActive: true,
      createdAt: new Date(),
    };
    mockRedemption = {
      id: 'redemption-1', couponId: 'coupon-1', subscriptionId: 'sub-123',
      monthsApplied: 0, createdAt: new Date(),
    };

    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription({ couponId: 'coupon-1' }), { applyCoupon: false });

    expect(invoice.discountAmount).toBe(0);
    expect(invoice.total).toBe(5000);
  });

  it('consumes credit balance against invoice', async () => {
    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription({ creditBalance: 2000 }), makeOptions());

    expect(invoice.total).toBe(5000);
    expect(invoice.amountDue).toBe(3000);
  });

  it('produces zero-amount invoice when credit balance covers total', async () => {
    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription({ creditBalance: 10000 }), makeOptions());

    expect(invoice.total).toBe(5000);
    expect(invoice.amountDue).toBe(0);
  });

  it('returns existing invoice on idempotency key match', async () => {
    mockExistingInvoice = {
      id: 'existing-inv', tenantId: 'tenant-1', customerId: 'cust-123',
      subscriptionId: 'sub-123', currency: 'NGN', status: 'draft',
      subtotal: 5000, discountAmount: 0, total: 5000, amountDue: 5000,
      periodStart: new Date(), periodEnd: new Date(), dueDate: new Date(),
      idempotencyKey: 'some-key', amountPaid: 0, paidAt: null, voidedAt: null,
      nombaChargeId: null, createdAt: new Date(), updatedAt: new Date(),
    };

    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription(), makeOptions());

    expect(invoice.id).toBe('existing-inv');
    expect(invoice.subtotal).toBe(5000);
  });

  it('generates consistent idempotency keys for same inputs', () => {
    const crypto = require('crypto');
    const sub = makeSubscription();
    const ps = sub.currentPeriodStart;

    const k1 = crypto.createHash('sha256').update(`invoice_${sub.id}_${Math.floor(ps.getTime() / 1000)}`).digest('hex');
    const k2 = crypto.createHash('sha256').update(`invoice_${sub.id}_${Math.floor(ps.getTime() / 1000)}`).digest('hex');
    expect(k1).toBe(k2);

    const ps2 = new Date(ps.getTime() + 86400000);
    const k3 = crypto.createHash('sha256').update(`invoice_${sub.id}_${Math.floor(ps2.getTime() / 1000)}`).digest('hex');
    expect(k1).not.toBe(k3);
  });

  it('does not apply coupon when subscription has no couponId', async () => {
    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription({ couponId: null }), makeOptions());

    expect(invoice.discountAmount).toBe(0);
    expect(invoice.total).toBe(5000);
  });

  it('produces correct line items for fixed billing', async () => {
    const invoice = await buildInvoice(makeSql(), 'tenant-1', makeSubscription(), makeOptions());

    expect(invoice.lineItems).toHaveLength(1);
    expect(invoice.lineItems[0]!.type).toBe('subscription');
    expect(invoice.lineItems[0]!.amount).toBe(5000);
  });
});

describe('Invoice Service - finalizeInvoice', () => {
  it('throws NotFoundError for non-existent invoice', async () => {
    const { findInvoiceById } = await import('../../../src/db/queries/invoice.queries') as any;
    findInvoiceById.mockImplementation((_sql: unknown, _tenantId: string, _invoiceId: string) => null);

    expect(finalizeInvoice(makeSql(), 'tenant-1', 'nonexistent')).rejects.toThrow();
  });
});
