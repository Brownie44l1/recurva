import { z } from 'zod';

export const createCouponSchema = z.object({
  code: z.string().min(1).max(50).transform((s) => s.toUpperCase()),
  discountType: z.enum(['percentage', 'fixed_amount']),
  discountValue: z.number().int().positive(),
  currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']).optional(),
  duration: z.enum(['once', 'repeating', 'forever']),
  durationMonths: z.number().int().positive().optional(),
  maxRedemptions: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional().transform((s) => s ? new Date(s) : undefined),
});

export const validateCouponSchema = z.object({
  code: z.string().min(1),
  currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']).optional(),
});
