import type { Sql } from 'postgres';
import type { Coupon, CreateCouponInput, DiscountResult } from './coupon.types';
import * as queries from '../../db/queries/coupon.queries';
import { CouponExpiredError, CouponExhaustedError, CouponCurrencyMismatchError, CouponNotFoundError, NotFoundError } from '../../errors';

export async function createCoupon(sql: Sql, tenantId: string, input: CreateCouponInput): Promise<Coupon> {
  return queries.insertCoupon(sql, tenantId, {
    code: input.code.toUpperCase(),
    discountType: input.discountType,
    discountValue: input.discountValue,
    currency: input.currency ?? null,
    duration: input.duration,
    durationMonths: input.durationMonths ?? null,
    maxRedemptions: input.maxRedemptions ?? null,
    expiresAt: input.expiresAt ?? null,
  });
}

export async function getCouponById(sql: Sql, tenantId: string, couponId: string): Promise<Coupon> {
  const coupon = await queries.findCouponById(sql, tenantId, couponId);
  if (!coupon) throw new NotFoundError('Coupon', couponId);
  return coupon;
}

export async function listCoupons(sql: Sql, tenantId: string, activeOnly?: boolean): Promise<Coupon[]> {
  return queries.listCoupons(sql, tenantId, activeOnly);
}

export async function archiveCoupon(sql: Sql, tenantId: string, couponId: string): Promise<Coupon> {
  const coupon = await getCouponById(sql, tenantId, couponId);
  return queries.archiveCoupon(sql, tenantId, couponId);
}

export async function validateCoupon(sql: Sql, tenantId: string, code: string, currency?: string): Promise<Coupon> {
  const coupon = await queries.findCouponByCode(sql, tenantId, code);
  if (!coupon || !coupon.isActive) throw new CouponNotFoundError(code);
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new CouponExpiredError(code);
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) throw new CouponExhaustedError(code);
  if (coupon.discountType === 'fixed_amount' && currency && coupon.currency !== currency) {
    throw new CouponCurrencyMismatchError(code, coupon.currency!, currency);
  }
  return coupon;
}

export async function applyDiscount(amount: number, coupon: Coupon): Promise<DiscountResult> {
  let discountAmount: number;

  if (coupon.discountType === 'percentage') {
    discountAmount = Math.floor(amount * coupon.discountValue / 100);
  } else {
    discountAmount = Math.min(coupon.discountValue, amount);
  }

  const totalAfterDiscount = Math.max(0, amount - discountAmount);

  return { discountAmount, totalAfterDiscount };
}

export async function recordRedemption(sql: Sql, tenantId: string, couponId: string, subscriptionId: string): Promise<void> {
  const existing = await queries.findRedemptionForUpdate(sql, couponId, subscriptionId);
  if (!existing) {
    await queries.insertRedemption(sql, couponId, subscriptionId);
    await queries.incrementRedemptionCount(sql, couponId);
  }
}
