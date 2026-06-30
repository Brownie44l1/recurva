import { z } from 'zod';

export const registerWebhookSchema = z.object({
  url: z.string().url(),
  eventTypes: z.array(z.string()).optional(),
  signingSecret: z.string().optional(),
});
