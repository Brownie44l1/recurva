export type BillingType = 'fixed' | 'metered' | 'mixed';
export type BillingInterval = 'day' | 'week' | 'month' | 'year';
export type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';

export interface Plan {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  billingType: BillingType;
  interval: BillingInterval;
  intervalCount: number;
  trialDays: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  prices: PlanCurrency[];
}

export interface PlanCurrency {
  id: string;
  planId: string;
  currency: Currency;
  amount: number;
  unitAmount: number | null;
}

export interface CreatePlanInput {
  name: string;
  description?: string;
  billingType: BillingType;
  interval: BillingInterval;
  intervalCount?: number;
  trialDays?: number;
  prices: {
    currency: Currency;
    amount: number;
    unitAmount?: number;
  }[];
}
