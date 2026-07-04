export type NormalizedPaymentEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded'
  | 'chargeback.opened'
  | 'checkout.completed';

export interface NormalizedPaymentEvent {
  id: string;
  type: NormalizedPaymentEventType;
  transactionId: string;
  customerId?: string;
  amount?: number;
  currency?: string;
  metadata: Record<string, unknown>;
  rawPayload: unknown;
}
