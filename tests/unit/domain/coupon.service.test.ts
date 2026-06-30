import { describe, it, expect } from 'bun:test';
import { applyDiscount } from '../../../src/domain/coupon/coupon.service';
import type { Coupon } from '../../../src/domain/coupon/coupon.types';

function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'test-id',
    tenantId: 'tenant-id',
    code: 'TEST20',
    discountType: 'percentage',
    discountValue: 20,
    currency: null,
    duration: 'once',
    durationMonths: null,
    maxRedemptions: null,
    redemptionCount: 0,
    expiresAt: null,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('Coupon Service - applyDiscount', () => {
  it('applies percentage discount correctly', async () => {
    const coupon = makeCoupon({ discountValue: 20 });
    const result = await applyDiscount(5000, coupon);

    expect(result.discountAmount).toBe(1000);
    expect(result.totalAfterDiscount).toBe(4000);
  });

  it('applies fixed amount discount correctly', async () => {
    const coupon = makeCoupon({ discountType: 'fixed_amount', discountValue: 2000 });
    const result = await applyDiscount(5000, coupon);

    expect(result.discountAmount).toBe(2000);
    expect(result.totalAfterDiscount).toBe(3000);
  });

  it('caps fixed discount at subtotal (no negative total)', async () => {
    const coupon = makeCoupon({ discountType: 'fixed_amount', discountValue: 10000 });
    const result = await applyDiscount(5000, coupon);

    expect(result.discountAmount).toBe(5000);
    expect(result.totalAfterDiscount).toBe(0);
  });

  it('handles zero subtotal', async () => {
    const coupon = makeCoupon({ discountValue: 20 });
    const result = await applyDiscount(0, coupon);

    expect(result.discountAmount).toBe(0);
    expect(result.totalAfterDiscount).toBe(0);
  });

  it('floors percentage discount correctly', async () => {
    const coupon = makeCoupon({ discountValue: 33 });
    const result = await applyDiscount(100, coupon);

    expect(result.discountAmount).toBe(33);
    expect(result.totalAfterDiscount).toBe(67);
  });
});
