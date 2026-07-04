export interface BillingResult {
  success: boolean;
  invoiceId: string;
  chargeId: string | null;
  status: 'paid' | 'failed' | 'dunning';
  failureReason?: string;
  usedBackupCard?: boolean;
}

export interface BillingContext {
  actorType: string;
  actorId?: string;
}
