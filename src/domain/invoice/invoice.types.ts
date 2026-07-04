export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
export type LineItemType = 'subscription' | 'metered' | 'proration' | 'credit' | 'tax';

export interface Invoice {
  id: string;
  tenantId: string;
  customerId: string;
  subscriptionId: string;
  currency: string;
  status: InvoiceStatus;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxRate: number | null;
  taxExemptionReason: string | null;
  total: number;
  amountDue: number;
  amountPaid: number;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  paidAt: Date | null;
  voidedAt: Date | null;
  nombaChargeId: string | null;
  idempotencyKey: string;
  fxRate: number | null;
  settlementCurrency: string | null;
  settlementAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
  lineItems: InvoiceLineItem[];
}

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  type: LineItemType;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date;
}

export interface BuildInvoiceOptions {
  periodStart?: Date;
  periodEnd?: Date;
  applyCoupon?: boolean;
  taxExemptionReason?: string | null;
}

export interface Charge {
  id: string;
  tenantId: string;
  customerId: string;
  invoiceId: string;
  paymentMethodId: string | null;
  currency: string;
  amount: number;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  nombaChargeId: string | null;
  nombaReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  amountRefunded: number;
  refundedAt: Date | null;
  fxRate: number | null;
  settlementCurrency: string | null;
  settlementAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
}
