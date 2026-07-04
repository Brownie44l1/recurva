import type {
  EmailAddress,
  EmailClient,
  EmailResult,
  SendEmailOptions,
  WelcomeTemplateData,
  VerificationTemplateData,
  PasswordResetTemplateData,
  SubscriptionCreatedTemplateData,
  PaymentReceiptTemplateData,
  PaymentFailedTemplateData,
  SenderProfile,
} from './email.types';

import { resolveSender } from './email.senders';

import { welcomeTemplate } from './templates/welcome';
import { verificationTemplate } from './templates/verify-email';
import { passwordResetTemplate } from './templates/password-reset';
import { subscriptionCreatedTemplate } from './templates/subscription-created';
import { paymentReceiptTemplate } from './templates/payment-receipt';
import { paymentFailedTemplate } from './templates/payment-failed';

import { EmailTemplateError } from './email.errors';

export interface EmailService {
  send(options: SendEmailOptions): Promise<EmailResult>;

  sendWelcomeEmail(to: EmailAddress, data: WelcomeTemplateData): Promise<EmailResult>;
  sendVerificationEmail(to: EmailAddress, data: VerificationTemplateData): Promise<EmailResult>;
  sendPasswordResetEmail(to: EmailAddress, data: PasswordResetTemplateData): Promise<EmailResult>;
  sendSubscriptionCreatedEmail(to: EmailAddress, data: SubscriptionCreatedTemplateData): Promise<EmailResult>;
  sendPaymentReceipt(to: EmailAddress, data: PaymentReceiptTemplateData): Promise<EmailResult>;
  sendPaymentFailedEmail(to: EmailAddress, data: PaymentFailedTemplateData): Promise<EmailResult>;
}

export interface EmailServiceConfig {
  client: EmailClient;
  defaultFromOverride?: string;
}

function sendWithSender(
  client: EmailClient,
  options: SendEmailOptions,
  sender: SenderProfile,
  defaultFromOverride?: string,
): Promise<EmailResult> {
  const resolved = resolveSender(sender, defaultFromOverride);
  return client.send({
    ...options,
    from: options.from ?? resolved.from,
    replyTo: options.replyTo ?? resolved.replyTo,
  });
}

export function createEmailService(config: EmailServiceConfig): EmailService {
  const { client, defaultFromOverride } = config;

  async function send(options: SendEmailOptions): Promise<EmailResult> {
    return sendWithSender(client, options, 'default', defaultFromOverride);
  }

  async function sendWelcomeEmail(to: EmailAddress, data: WelcomeTemplateData): Promise<EmailResult> {
    let html: string;
    try {
      html = welcomeTemplate(data);
    } catch (err) {
      throw new EmailTemplateError('welcome', err);
    }
    return sendWithSender(client, { to, subject: 'Welcome to Recurva!', html }, 'default', defaultFromOverride);
  }

  async function sendVerificationEmail(to: EmailAddress, data: VerificationTemplateData): Promise<EmailResult> {
    let html: string;
    try {
      html = verificationTemplate(data);
    } catch (err) {
      throw new EmailTemplateError('verify-email', err);
    }
    return sendWithSender(client, { to, subject: 'Verify your email address', html }, 'security', defaultFromOverride);
  }

  async function sendPasswordResetEmail(to: EmailAddress, data: PasswordResetTemplateData): Promise<EmailResult> {
    let html: string;
    try {
      html = passwordResetTemplate(data);
    } catch (err) {
      throw new EmailTemplateError('password-reset', err);
    }
    return sendWithSender(client, { to, subject: 'Reset your password', html }, 'security', defaultFromOverride);
  }

  async function sendSubscriptionCreatedEmail(
    to: EmailAddress,
    data: SubscriptionCreatedTemplateData,
  ): Promise<EmailResult> {
    let html: string;
    try {
      html = subscriptionCreatedTemplate(data);
    } catch (err) {
      throw new EmailTemplateError('subscription-created', err);
    }
    return sendWithSender(client, { to, subject: 'Subscription confirmed!', html }, 'billing', defaultFromOverride);
  }

  async function sendPaymentReceipt(to: EmailAddress, data: PaymentReceiptTemplateData): Promise<EmailResult> {
    let html: string;
    try {
      html = paymentReceiptTemplate(data);
    } catch (err) {
      throw new EmailTemplateError('payment-receipt', err);
    }
    return sendWithSender(client, { to, subject: 'Payment receipt', html }, 'billing', defaultFromOverride);
  }

  async function sendPaymentFailedEmail(to: EmailAddress, data: PaymentFailedTemplateData): Promise<EmailResult> {
    let html: string;
    try {
      html = paymentFailedTemplate(data);
    } catch (err) {
      throw new EmailTemplateError('payment-failed', err);
    }
    return sendWithSender(client, { to, subject: 'Payment failed', html }, 'billing', defaultFromOverride);
  }

  return {
    send,
    sendWelcomeEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendSubscriptionCreatedEmail,
    sendPaymentReceipt,
    sendPaymentFailedEmail,
  };
}
