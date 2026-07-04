import { Resend } from 'resend';
import { logger } from '../../logger';
import type { EmailClient, SendEmailOptions, EmailResult } from './email.types';
import { EmailConfigurationError, EmailSendError } from './email.errors';

export function createEmailClient(apiKey: string): EmailClient {
  if (!apiKey) {
    throw new EmailConfigurationError('RESEND_API_KEY is not configured');
  }

  const resend = new Resend(apiKey);

  async function send(options: SendEmailOptions): Promise<EmailResult> {
    const to = Array.isArray(options.to) ? options.to : [options.to];
    const from = options.from;

    if (!from) {
      throw new EmailConfigurationError('from address is required to send email');
    }

    logger.debug(
      { to, subject: options.subject, template: options.tags?.find((t) => t.name === 'template')?.value },
      'Sending email',
    );

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      scheduledAt: options.scheduledAt,
      headers: options.headers,
      tags: options.tags,
    });

    if (error) {
      throw new EmailSendError(`Failed to send email: ${error.message}`, error);
    }

    if (!data?.id) {
      throw new EmailSendError('Email was sent but no ID was returned');
    }

    logger.info({ emailId: data.id, to, subject: options.subject, from }, 'Email sent successfully');

    return {
      id: data.id,
      to,
      from,
      subject: options.subject,
    };
  }

  return { send };
}
