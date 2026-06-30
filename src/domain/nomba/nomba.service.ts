import type { ChargeInput, ChargeResult, CheckoutInput, CheckoutResult, RefundInput, RefundResult } from './nomba.types';
import { createNombaClient } from '../../nomba/client';
import type { Tenant } from '../tenant/tenant.types';

export async function chargeCard(tenant: Tenant, input: ChargeInput): Promise<ChargeResult> {
  const client = createNombaClient(tenant);
  return client.charge(input);
}

export async function createCheckoutSession(tenant: Tenant, input: CheckoutInput): Promise<CheckoutResult> {
  const client = createNombaClient(tenant);
  return client.checkout(input);
}

export async function refund(tenant: Tenant, input: RefundInput): Promise<RefundResult> {
  const client = createNombaClient(tenant);
  return client.refund(input);
}
