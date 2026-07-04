import * as crypto from 'crypto';
import type {
  PaymentProcessor, ChargeInput, ChargeResult, CheckoutInput, CheckoutResult,
  RefundInput, RefundResult, CreateCustomerInput, CustomerResult,
  AttachPaymentMethodInput, PaymentMethodResult, TransactionStatus,
} from './payment-processor.interface';
import { WebhookVerificationError } from './payment-processor.interface';
import type { NormalizedPaymentEvent } from './payment-event.types';
import { createNombaClient } from '../../nomba/client';
import { config } from '../../config';
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

  async handleWebhook(payload: string, signature: string): Promise<NormalizedPaymentEvent> {
    return NombaAdapter.verifyAndParse(payload, signature);
  }

  static verifyAndParse(payload: string, signature: string): NormalizedPaymentEvent {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new WebhookVerificationError('Invalid JSON payload');
    }

    const event = parsed.event as string | undefined;

    if (event === 'checkout.completed') {
      const data = parsed.data as Record<string, unknown> | undefined;
      if (!data) {
        throw new WebhookVerificationError('Missing data in checkout callback');
      }

      const sigFromBody = parsed.signature as string | undefined;
      const providedSignature = signature || sigFromBody || '';
      if (!providedSignature) {
        throw new WebhookVerificationError('Missing signature');
      }

      const canonical = [
        event,
        data.orderReference as string,
        data.transactionId as string,
        String(data.amount ?? 0),
        data.currency as string,
      ].join(':');

      const expected = crypto
        .createHmac('sha256', config.NOMBA_WEBHOOK_SECRET)
        .update(canonical)
        .digest('hex');

      let valid = false;
      try {
        valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedSignature));
      } catch {
        throw new WebhookVerificationError('Invalid signature');
      }

      if (!valid) {
        throw new WebhookVerificationError('Invalid signature');
      }

      return {
        id: `checkout_${data.transactionId as string}`,
        type: 'checkout.completed',
        transactionId: data.transactionId as string,
        customerId: data.customerId as string | undefined,
        amount: data.amount as number | undefined,
        currency: data.currency as string | undefined,
        metadata: {
          orderReference: data.orderReference as string,
          token: data.token as string,
          last4: data.last4 as string,
          cardBrand: data.cardBrand as string,
          expMonth: data.expMonth as number,
          expYear: data.expYear as number,
        },
        rawPayload: parsed,
      };
    }

    const expected = crypto
      .createHmac('sha256', config.NOMBA_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    let valid = false;
    try {
      valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      throw new WebhookVerificationError('Invalid signature');
    }

    if (!valid) {
      throw new WebhookVerificationError('Invalid signature');
    }

    const eventId = parsed.eventId as string | undefined;
    const data = parsed.data as Record<string, unknown> | undefined;

    switch (event) {
      case 'charge.success': {
        if (!data) {
          throw new WebhookVerificationError('Missing data in charge.success');
        }
        return {
          id: eventId ?? `cs_${Date.now()}`,
          type: 'payment.succeeded',
          transactionId: (data.transactionId as string) ?? '',
          customerId: data.customerId as string | undefined,
          amount: data.amount as number | undefined,
          currency: data.currency as string | undefined,
          metadata: {
            invoiceId: data.invoiceId as string,
            subscriptionId: data.subscriptionId as string,
            tenantId: data.tenantId as string,
          },
          rawPayload: parsed,
        };
      }

      case 'charge.failure': {
        if (!data) {
          throw new WebhookVerificationError('Missing data in charge.failure');
        }
        return {
          id: eventId ?? `cf_${Date.now()}`,
          type: 'payment.failed',
          transactionId: (data.transactionId as string) ?? '',
          customerId: data.customerId as string | undefined,
          amount: data.amount as number | undefined,
          currency: data.currency as string | undefined,
          metadata: {
            invoiceId: data.invoiceId as string,
            subscriptionId: data.subscriptionId as string,
            tenantId: data.tenantId as string,
            failureCode: data.failureCode as string,
            failureMessage: data.failureMessage as string,
          },
          rawPayload: parsed,
        };
      }

      case 'refund.completed': {
        if (!data) {
          throw new WebhookVerificationError('Missing data in refund.completed');
        }
        return {
          id: eventId ?? `rf_${Date.now()}`,
          type: 'payment.refunded',
          transactionId: (data.transactionId as string) ?? '',
          amount: data.amount as number | undefined,
          currency: data.currency as string | undefined,
          metadata: {
            chargeId: data.chargeId as string,
            reason: data.reason as string,
          },
          rawPayload: parsed,
        };
      }

      case 'chargeback.opened': {
        if (!data) {
          throw new WebhookVerificationError('Missing data in chargeback.opened');
        }
        return {
          id: eventId ?? `cb_${Date.now()}`,
          type: 'chargeback.opened',
          transactionId: (data.transactionId as string) ?? '',
          amount: data.amount as number | undefined,
          currency: data.currency as string | undefined,
          metadata: {
            invoiceId: data.invoiceId as string,
            reason: data.reason as string,
          },
          rawPayload: parsed,
        };
      }

      default:
        throw new WebhookVerificationError(`Unsupported event: ${event}`);
    }
  }

  async createCustomer(customerDetails: CreateCustomerInput): Promise<CustomerResult> {
    return this.client.createCustomer(customerDetails);
  }

  async attachPaymentMethod(customerId: string, methodToken: string): Promise<PaymentMethodResult> {
    return this.client.attachPaymentMethod(customerId, methodToken);
  }

  async getTransactionStatus(transactionId: string): Promise<TransactionStatus> {
    return this.client.getTransactionStatus(transactionId);
  }
}
