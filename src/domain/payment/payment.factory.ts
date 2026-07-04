import type { PaymentProcessor } from './payment-processor.interface';
import { NombaAdapter } from './nomba.adapter';
import { PaystackAdapter } from './paystack.adapter';
import type { Tenant } from '../tenant/tenant.types';

export function getPaymentProcessor(tenant: Tenant): PaymentProcessor {
  switch (tenant.preferredProcessor) {
    case 'paystack':
      return new PaystackAdapter(tenant);
    case 'nomba':
    default:
      return new NombaAdapter(tenant);
  }
}
