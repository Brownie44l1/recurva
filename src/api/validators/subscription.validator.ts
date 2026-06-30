import { z } from 'zod';

export const createSubscriptionSchema = z.object({
  customerId: z.string().uuid(),
  planId: z.string().uuid(),
  currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']),
  couponCode: z.string().optional(),
  paymentMethodId: z.string().uuid().optional(),
  trialDays: z.number().int().min(0).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const cancelSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean().optional().default(false),
  reason: z.string().max(500).optional(),
});

export const changePlanSchema = z.object({
  newPlanId: z.string().uuid(),
  immediate: z.boolean().optional().default(false),
});
