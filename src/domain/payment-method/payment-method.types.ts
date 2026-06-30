export interface PaymentMethod {
  id: string;
  customerId: string;
  tenantId: string;
  nombaToken: string;
  cardLast4: string;
  cardBrand: string;
  cardExpMonth: number;
  cardExpYear: number;
  isPrimary: boolean;
  isBackup: boolean;
  createdAt: Date;
}

export interface AttachPaymentMethodInput {
  nombaToken: string;
  cardLast4: string;
  cardBrand: string;
  cardExpMonth: number;
  cardExpYear: number;
}
