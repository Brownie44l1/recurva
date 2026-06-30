export type DiscountType = 'percentage' | 'fixed_amount';
export type CouponDuration = 'once' | 'repeating' | 'forever';

export interface Coupon {
  id: string;
  tenantId: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  currency: string | null;
  duration: CouponDuration;
  durationMonths: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  subscriptionId: string;
  monthsApplied: number;
  redeemedAt: Date;
}

export interface CreateCouponInput {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  currency?: string;
  duration: CouponDuration;
  durationMonths?: number;
  maxRedemptions?: number;
  expiresAt?: Date;
}

export interface CouponValidationResult {
  valid: boolean;
  coupon: Coupon | null;
  error?: string;
}

export interface DiscountResult {
  discountAmount: number;
  totalAfterDiscount: number;
}
