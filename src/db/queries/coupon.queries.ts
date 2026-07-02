import type { Sql } from 'postgres';
import type { Coupon, CouponRedemption } from '../../domain/coupon/coupon.types';

export async function insertCoupon(sql: Sql, tenantId: string, input: {
  code: string;
  discountType: string;
  discountValue: number;
  currency: string | null;
  duration: string;
  durationMonths: number | null;
  maxRedemptions: number | null;
  expiresAt: Date | null;
}): Promise<Coupon> {
  const [row] = await sql<Coupon[]>`
    INSERT INTO coupons (tenant_id, code, discount_type, discount_value, currency, duration, duration_months, max_redemptions, expires_at)
    VALUES (${tenantId}, ${input.code}, ${input.discountType}, ${input.discountValue}, ${input.currency ?? null}, ${input.duration}, ${input.durationMonths ?? null}, ${input.maxRedemptions ?? null}, ${input.expiresAt ?? null})
    RETURNING *
  `;
  return row!;
}

export async function findCouponById(sql: Sql, tenantId: string, couponId: string): Promise<Coupon | null> {
  const [row] = await sql<Coupon[]>`
    SELECT * FROM coupons WHERE id = ${couponId} AND tenant_id = ${tenantId} LIMIT 1
  `;
  return row ?? null;
}

export async function findCouponByCode(sql: Sql, tenantId: string, code: string): Promise<Coupon | null> {
  const [row] = await sql<Coupon[]>`
    SELECT * FROM coupons WHERE tenant_id = ${tenantId} AND LOWER(code) = LOWER(${code}) LIMIT 1
  `;
  return row ?? null;
}

export async function listCoupons(sql: Sql, tenantId: string, activeOnly?: boolean): Promise<Coupon[]> {
  return sql<Coupon[]>`
    SELECT * FROM coupons
    WHERE tenant_id = ${tenantId}
      AND (${activeOnly ?? false} = false OR is_active = TRUE)
    ORDER BY created_at DESC
  `;
}

export async function archiveCoupon(sql: Sql, tenantId: string, couponId: string): Promise<Coupon> {
  const [row] = await sql<Coupon[]>`
    UPDATE coupons SET is_active = FALSE WHERE id = ${couponId} AND tenant_id = ${tenantId} RETURNING *
  `;
  return row!;
}

export async function incrementRedemptionCount(sql: Sql, couponId: string): Promise<void> {
  await sql`
    UPDATE coupons SET redemption_count = redemption_count + 1 WHERE id = ${couponId}
  `;
}

export async function findRedemption(sql: Sql, couponId: string, subscriptionId: string): Promise<CouponRedemption | null> {
  const [row] = await sql<CouponRedemption[]>`
    SELECT * FROM coupon_redemptions WHERE coupon_id = ${couponId} AND subscription_id = ${subscriptionId} LIMIT 1
  `;
  return row ?? null;
}

export async function findRedemptionForUpdate(sql: Sql, couponId: string, subscriptionId: string): Promise<CouponRedemption | null> {
  const [row] = await sql<CouponRedemption[]>`
    SELECT * FROM coupon_redemptions WHERE coupon_id = ${couponId} AND subscription_id = ${subscriptionId} LIMIT 1
    FOR UPDATE
  `;
  return row ?? null;
}

export async function insertRedemption(sql: Sql, couponId: string, subscriptionId: string): Promise<CouponRedemption> {
  const [row] = await sql<CouponRedemption[]>`
    INSERT INTO coupon_redemptions (coupon_id, subscription_id)
    VALUES (${couponId}, ${subscriptionId})
    RETURNING *
  `;
  return row!;
}

export async function incrementMonthsApplied(sql: Sql, couponId: string, subscriptionId: string): Promise<void> {
  await sql`
    UPDATE coupon_redemptions SET months_applied = months_applied + 1
    WHERE coupon_id = ${couponId} AND subscription_id = ${subscriptionId}
  `;
}
