import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { config } from '../../config';
import { createEmailClient } from '../../infrastructure/email/email.client';
import { createEmailService } from '../../infrastructure/email/email.service';

const router = new Hono();

const sendTestSchema = z.object({
  to: z.string().email(),
});

router.post('/test', zValidator('json', sendTestSchema), async (c) => {
  const { to } = c.req.valid('json');

  const client = createEmailClient(config.RESEND_API_KEY);
  const emailService = createEmailService({
    client,
    defaultFromOverride: config.EMAIL_FROM,
  });

  const result = await emailService.sendWelcomeEmail(to, { name: to.split('@')[0] ?? 'there' });

  return c.json({ success: true, emailId: result.id, from: result.from });
});

export { router as emailRoutes };
