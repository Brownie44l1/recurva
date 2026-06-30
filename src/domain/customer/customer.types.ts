export interface Customer {
  id: string;
  tenantId: string;
  externalId: string | null;
  email: string;
  name: string | null;
  currency: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCustomerInput {
  externalId?: string;
  email: string;
  name?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateCustomerInput {
  name?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}
