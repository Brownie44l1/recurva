export interface Tenant {
  id: string;
  name: string;
  email: string;
  nombaAccountId: string;
  webhookSecret: string;
  mode: 'test' | 'live';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantApiKey {
  id: string;
  tenantId: string;
  keyPrefix: string;
  keyHash: string;
  label: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface CreateTenantInput {
  name: string;
  email: string;
}

export interface CreateApiKeyInput {
  tenantId: string;
  label?: string;
  expiresAt?: Date;
}
