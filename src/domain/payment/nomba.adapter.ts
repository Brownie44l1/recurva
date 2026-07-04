import type { PaymentProcessor, ChargeInput, ChargeResult, CheckoutInput, CheckoutResult, RefundInput, RefundResult } from './payment-processor.interface';
import { createNombaClient } from '../../nomba/client';
import type { Tenant } from '../tenant/tenant.types';

export class NombaAdapter implements PaymentProcessor {
  private client: ReturnType<typeof createNombaClient>;

  constructor(private tenant: Tenant) {
    this.client = createNombaClient(tenant);
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    return this.client.charge(input);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    return this.client.checkout(input);
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return this.client.refund(input);
  }

  supportsCurrency(currency: string): boolean {
    return ['NGN', 'USD'].includes(currency.toUpperCase());
  }
}
