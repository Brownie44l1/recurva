export interface BillingResult {
  success: boolean;
  invoiceId: string;
  chargeId: string | null;
  status: 'paid' | 'failed' | 'dunning';
  failureReason?: string;
}

export interface BillingContext {
  actorType: string;
  actorId?: string;
}
