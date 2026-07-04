export { createEmailClient } from './email.client';
export { createEmailService } from './email.service';
export type { EmailService, EmailServiceConfig } from './email.service';
export type {
  EmailAddress,
  SendEmailOptions,
  EmailResult,
  EmailClient,
  SenderProfile,
  WelcomeTemplateData,
  VerificationTemplateData,
  PasswordResetTemplateData,
  SubscriptionCreatedTemplateData,
  PaymentReceiptTemplateData,
  PaymentFailedTemplateData,
} from './email.types';
export { resolveSender } from './email.senders';
export type { ResolvedSender } from './email.senders';
export {
  EmailError,
  EmailConfigurationError,
  EmailSendError,
  EmailRateLimitError,
  InvalidEmailAddressError,
  EmailTemplateError,
} from './email.errors';
