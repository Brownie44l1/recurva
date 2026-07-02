import { z } from 'zod';

export const registerWebhookSchema = z.object({
  url: z.string().url().refine(
    (val) => {
      try {
        const url = new URL(val);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Only http and https URLs are allowed' },
  ),
  eventTypes: z.array(z.string()).optional(),
  signingSecret: z.string().optional(),
});
