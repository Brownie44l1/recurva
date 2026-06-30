import type { CreateTenantInput } from '../../src/domain/tenant/tenant.types';
import type { CreatePlanInput } from '../../src/domain/plan/plan.types';
import type { CreateCustomerInput } from '../../src/domain/customer/customer.types';
import type { CreateSubscriptionInput } from '../../src/domain/subscription/subscription.types';

export function buildTenantInput(overrides: Partial<CreateTenantInput> = {}): CreateTenantInput {
  return {
    name: 'Test Tenant',
    email: `test-${Date.now()}@example.com`,
    ...overrides,
  };
}

export function buildPlanInput(overrides: Partial<CreatePlanInput> = {}): CreatePlanInput {
  return {
    name: 'Test Plan',
    description: 'A test plan',
    billingType: 'fixed',
    interval: 'month',
    intervalCount: 1,
    trialDays: 0,
    prices: [{ currency: 'NGN', amount: 5000 }],
    ...overrides,
  };
}

export function buildCustomerInput(overrides: Partial<CreateCustomerInput> = {}): CreateCustomerInput {
  return {
    email: `customer-${Date.now()}@example.com`,
    name: 'Test Customer',
    currency: 'NGN',
    ...overrides,
  };
}

export function buildSubscriptionInput(overrides: Partial<CreateSubscriptionInput> = {}): CreateSubscriptionInput {
  return {
    customerId: '00000000-0000-0000-0000-000000000000',
    planId: '00000000-0000-0000-0000-000000000000',
    currency: 'NGN',
    ...overrides,
  };
}
