import type { SenderProfile } from './email.senders';

export type EmailAddress = string;

export interface SendEmailOptions {
  to: EmailAddress | EmailAddress[];
  subject: string;
  html: string;
  text?: string;
  from?: EmailAddress;
  replyTo?: EmailAddress;
  scheduledAt?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
}

export interface EmailResult {
  id: string;
  to: EmailAddress[];
  from: EmailAddress;
  subject: string;
}

export interface EmailClient {
  send(options: SendEmailOptions): Promise<EmailResult>;
}

export interface WelcomeTemplateData {
  name: string;
}

export interface VerificationTemplateData {
  name: string;
  verificationUrl: string;
}

export interface PasswordResetTemplateData {
  name: string;
  resetUrl: string;
}

export interface SubscriptionCreatedTemplateData {
  name: string;
  planName: string;
  nextBillingDate: string;
  amount: string;
}

export interface PaymentReceiptTemplateData {
  name: string;
  amount: string;
  currency: string;
  date: string;
  receiptUrl: string;
  description: string;
}

export interface PaymentFailedTemplateData {
  name: string;
  amount: string;
  currency: string;
  date: string;
  retryUrl: string;
  reason: string;
}

export type { SenderProfile };
