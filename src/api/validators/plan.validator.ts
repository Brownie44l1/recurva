import { z } from 'zod';

export const createPlanSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  billingType: z.enum(['fixed', 'metered', 'mixed']),
  interval: z.enum(['day', 'week', 'month', 'year']),
  intervalCount: z.number().int().positive().optional().default(1),
  trialDays: z.number().int().min(0).optional(),
  prices: z.array(z.object({
    currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']),
    amount: z.number().int().min(0),
    unitAmount: z.number().int().min(0).optional(),
  })).min(1),
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  prices: z.array(z.object({
    currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']),
    amount: z.number().int().min(0),
    unitAmount: z.number().int().min(0).optional(),
  })).optional(),
});

export const listPlansQuerySchema = z.object({
  type: z.enum(['fixed', 'metered', 'mixed']).optional(),
  archived: z.coerce.boolean().optional(),
});
