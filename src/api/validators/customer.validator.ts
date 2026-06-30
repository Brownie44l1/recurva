import { z } from 'zod';

export const createCustomerSchema = z.object({
  externalId: z.string().optional(),
  email: z.string().email(),
  name: z.string().max(255).optional(),
  currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']).optional().default('NGN'),
  metadata: z.record(z.unknown()).optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().max(255).optional(),
  email: z.string().email().optional(),
  metadata: z.record(z.unknown()).optional(),
});
