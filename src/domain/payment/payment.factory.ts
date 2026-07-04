import type { PaymentProcessor } from './payment-processor.interface';
import { NombaAdapter } from './nomba.adapter';
import type { Tenant } from '../tenant/tenant.types';

export function getPaymentProcessor(tenant: Tenant): PaymentProcessor {
  return new NombaAdapter(tenant);
}
