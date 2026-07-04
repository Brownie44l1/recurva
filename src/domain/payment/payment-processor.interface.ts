import type { NormalizedPaymentEvent } from './payment-event.types';

export interface ChargeInput {
  token: string;
  amount: number;
  currency: string;
  transactionReference: string;
  callbackUrl: string;
  metadata?: Record<string, string>;
}

export interface ChargeResult {
  chargeId: string;
  status: string;
  amount: number;
  currency: string;
  transactionId?: string;
}

export interface CheckoutInput {
  orderReference: string;
  customerId: string;
  amount: number;
  currency: string;
  callbackUrl: string;
  returnUrl: string;
  saveCard: boolean;
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  checkoutUrl: string;
  orderReference: string;
  status: string;
}

export interface RefundInput {
  transactionId: string;
  amount: number;
  reason: string;
  reference: string;
}

export interface RefundResult {
  refundId: string;
  status: string;
  amount: number;
}

export interface CreateCustomerInput {
  email: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface CustomerResult {
  customerId: string;
}

export interface AttachPaymentMethodInput {
  token: string;
  cardLast4?: string;
  cardBrand?: string;
  cardExpMonth?: number;
  cardExpYear?: number;
}

export interface PaymentMethodResult {
  methodId: string;
  isPrimary: boolean;
}

export interface TransactionStatus {
  status: string;
  amount: number;
  currency: string;
  paidAt?: string;
  failureCode?: string;
  failureMessage?: string;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export interface PaymentProcessor {
  charge(input: ChargeInput): Promise<ChargeResult>;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  supportsCurrency(currency: string): boolean;
  handleWebhook(payload: string, signature: string): Promise<NormalizedPaymentEvent>;
  createCustomer?(customerDetails: CreateCustomerInput): Promise<CustomerResult>;
  attachPaymentMethod?(customerId: string, methodToken: string): Promise<PaymentMethodResult>;
  getTransactionStatus?(transactionId: string): Promise<TransactionStatus>;
}
