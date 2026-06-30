import { z } from 'zod';

export const reportUsageSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  quantity: z.number().int().min(0),
  timestamp: z.string().datetime().transform((s) => new Date(s)),
});
