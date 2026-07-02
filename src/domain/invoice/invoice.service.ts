import type { Sql } from 'postgres';
import type { Invoice, InvoiceLineItem, BuildInvoiceOptions } from './invoice.types';
import * as queries from '../../db/queries/invoice.queries';
import * as subscriptionQueries from '../../db/queries/subscription.queries';
import * as planQueries from '../../db/queries/plan.queries';
import * as usageQueries from '../../db/queries/usage.queries';
import * as couponQueries from '../../db/queries/coupon.queries';
import { validateCoupon, applyDiscount } from '../coupon/coupon.service';
import { NotFoundError } from '../../errors';
import * as crypto from 'crypto';

function buildIdempotencyKey(subscriptionId: string, periodStart: Date): string {
  const hash = crypto.createHash('sha256');
  hash.update(`invoice_${subscriptionId}_${Math.floor(periodStart.getTime() / 1000)}`);
  return hash.digest('hex');
}

export async function buildInvoice(
  sql: Sql,
  tenantId: string,
  subscription: { id: string; customerId: string; planId: string; currency: string; couponId: string | null; creditBalance: number; currentPeriodStart: Date; currentPeriodEnd: Date },
  options: BuildInvoiceOptions = {},
): Promise<Invoice> {
  const periodStart = options.periodStart ?? subscription.currentPeriodStart;
  const periodEnd = options.periodEnd ?? subscription.currentPeriodEnd;
  const idempotencyKey = buildIdempotencyKey(subscription.id, periodStart);

  const existing = await queries.findInvoiceByIdempotencyKey(sql, idempotencyKey);
  if (existing) {
    const lineItems = await queries.findInvoiceById(sql, tenantId, existing.id)
      .then((r) => r?.lineItems ?? []);
    return { ...existing, lineItems };
  }

  const plan = await planQueries.findPlanById(sql, tenantId, subscription.planId);
  if (!plan) throw new NotFoundError('Plan', subscription.planId);

  const price = plan.prices.find((p) => p.currency === subscription.currency);
  if (!price) throw new NotFoundError('Price', `${subscription.planId}:${subscription.currency}`);

  let subtotal = price.amount;
  let discountAmount = 0;

  const planAmount = price.amount;

  if (plan.billingType === 'metered' || plan.billingType === 'mixed') {
    const usage = await usageQueries.aggregateUsage(sql, subscription.id, periodStart, periodEnd);
    const unitAmount = price.unitAmount ?? 0;
    const meteredCharge = usage.totalUnits * unitAmount;
    subtotal += meteredCharge;
  }

  if (options.applyCoupon && subscription.couponId) {
    const coupon = await couponQueries.findCouponById(sql, tenantId, subscription.couponId);
    if (coupon && coupon.isActive) {
      const redemption = await couponQueries.findRedemption(sql, coupon.id, subscription.id);
      const monthsApplied = redemption?.monthsApplied ?? 0;

      let eligible = true;
      if (coupon.duration === 'once' && monthsApplied > 0) eligible = false;
      if (coupon.duration === 'repeating' && coupon.durationMonths && monthsApplied >= coupon.durationMonths) eligible = false;

      if (eligible) {
        const { discountAmount: da } = await applyDiscount(planAmount, coupon);
        discountAmount = da;
        await couponQueries.incrementMonthsApplied(sql, coupon.id, subscription.id);
      }
    }
  }

  const total = Math.max(0, subtotal - discountAmount);
  const amountDue = Math.max(0, total - subscription.creditBalance);

  const dueDate = new Date(periodEnd);

  const invoice = await queries.insertInvoice(sql, tenantId, {
    customerId: subscription.customerId,
    subscriptionId: subscription.id,
    currency: subscription.currency,
    subtotal,
    discountAmount,
    total,
    amountDue,
    periodStart,
    periodEnd,
    dueDate,
    idempotencyKey,
  });

  const lineItems: InvoiceLineItem[] = [];

  const subLineItem = await queries.insertLineItem(sql, invoice.id, {
    type: 'subscription',
    description: `${plan.name} (${subscription.currency})`,
    quantity: 1,
    unitAmount: planAmount,
    amount: planAmount,
    periodStart,
    periodEnd,
  });
  lineItems.push(subLineItem);

  if (discountAmount > 0) {
    const discLineItem = await queries.insertLineItem(sql, invoice.id, {
      type: 'credit',
      description: 'Coupon discount',
      quantity: 1,
      unitAmount: -discountAmount,
      amount: -discountAmount,
    });
    lineItems.push(discLineItem);
  }

  if (subscription.creditBalance > 0) {
    const creditUse = Math.min(subscription.creditBalance, total);
    if (creditUse > 0) {
      const creditLineItem = await queries.insertLineItem(sql, invoice.id, {
        type: 'credit',
        description: 'Credit balance applied',
        quantity: 1,
        unitAmount: -creditUse,
        amount: -creditUse,
      });
      lineItems.push(creditLineItem);
    }
  }

  return { ...invoice, lineItems };
}

export async function finalizeInvoice(sql: Sql, tenantId: string, invoiceId: string): Promise<Invoice> {
  const invoice = await queries.findInvoiceById(sql, tenantId, invoiceId);
  if (!invoice) throw new NotFoundError('Invoice', invoiceId);
  if (invoice.status !== 'draft') return invoice;

  const updated = await queries.updateInvoiceStatus(sql, invoiceId, 'open');
  const lineItems = (await queries.findInvoiceById(sql, tenantId, invoiceId))?.lineItems ?? [];
  return { ...updated, lineItems };
}

export async function listInvoices(sql: Sql, tenantId: string, customerId: string, limit?: number, offset?: number): Promise<Invoice[]> {
  return queries.listInvoicesByCustomer(sql, tenantId, customerId, limit ?? 20, offset ?? 0);
}

export async function getInvoice(sql: Sql, tenantId: string, invoiceId: string): Promise<Invoice> {
  const invoice = await queries.findInvoiceById(sql, tenantId, invoiceId);
  if (!invoice) throw new NotFoundError('Invoice', invoiceId);
  return invoice;
}

export async function voidInvoice(sql: Sql, tenantId: string, invoiceId: string): Promise<Invoice> {
  const current = await queries.findInvoiceById(sql, tenantId, invoiceId);
  if (!current) throw new NotFoundError('Invoice', invoiceId);

  const wasPaid = current.status === 'paid';
  if (wasPaid) {
    const creditLineItem = current.lineItems.find((li) => li.type === 'credit' && li.amount < 0);
    if (creditLineItem) {
      const creditToRestore = Math.abs(creditLineItem.amount);
      await subscriptionQueries.restoreCreditBalance(sql, current.subscriptionId, creditToRestore);
    }
  }

  const invoice = await queries.updateInvoiceStatus(sql, invoiceId, 'void');
  const lineItems = (await queries.findInvoiceById(sql, tenantId, invoiceId))?.lineItems ?? [];
  return { ...invoice, lineItems };
}
