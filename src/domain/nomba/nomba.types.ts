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

export interface TokenizeInput {
  token: string;
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
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
