import * as crypto from 'crypto';
import type {
  PaymentProcessor, ChargeInput, ChargeResult, CheckoutInput, CheckoutResult,
  RefundInput, RefundResult, CreateCustomerInput, CustomerResult,
  PaymentMethodResult, TransactionStatus,
} from './payment-processor.interface';
import { WebhookVerificationError } from './payment-processor.interface';
import type { NormalizedPaymentEvent } from './payment-event.types';
import { createPaystackClient } from '../../paystack/client';
import type { Tenant } from '../tenant/tenant.types';
import { config } from '../../config';
import { logger } from '../../logger';

export class PaystackAdapter implements PaymentProcessor {
  private client: ReturnType<typeof createPaystackClient>;

  constructor(private tenant: Tenant) {
    this.client = createPaystackClient();
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const result = await this.client.charge({
      amount: input.amount,
      currency: input.currency,
      authorizationCode: input.token,
      reference: input.transactionReference,
      email: input.metadata?.email ?? '',
      metadata: input.metadata,
    });
    return {
      chargeId: String(result.id),
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      transactionId: result.reference,
    };
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const result = await this.client.initializeTransaction({
      email: input.metadata?.email ?? input.customerId,
      amount: input.amount,
      currency: input.currency,
      reference: input.orderReference,
      callbackUrl: input.callbackUrl,
      metadata: input.metadata,
    });
    return {
      checkoutUrl: result.authorizationUrl,
      orderReference: result.reference,
      status: 'success',
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const result = await this.client.refund({
      transactionReference: input.transactionId,
      amount: input.amount,
      reason: input.reason,
    });
    return {
      refundId: String(result.refundId),
      status: result.status,
      amount: input.amount,
    };
  }

  supportsCurrency(currency: string): boolean {
    return ['NGN', 'USD', 'GHS', 'ZAR', 'KES', 'GBP'].includes(currency.toUpperCase());
  }

  async handleWebhook(payload: string, signature: string): Promise<NormalizedPaymentEvent> {
    return PaystackAdapter.verifyAndParse(payload, signature);
  }

  static verifyAndParse(payload: string, signature: string): NormalizedPaymentEvent {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new WebhookVerificationError('Invalid JSON payload');
    }

    const webhookSecret = config.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_WEBHOOK_SECRET || '';
    const expected = crypto
      .createHmac('sha512', webhookSecret)
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

    const psEvent = parsed.event as string | undefined;
    const psData = parsed.data as Record<string, unknown> | undefined;

    if (!psEvent) {
      throw new WebhookVerificationError('Missing event type');
    }

    const metadata = (psData?.metadata as Record<string, unknown>) ?? {};

    switch (psEvent) {
      case 'charge.success': {
        return {
          id: (psData?.id as string) ?? `ps_cs_${Date.now()}`,
          type: 'payment.succeeded',
          transactionId: (psData?.reference as string) ?? '',
          customerId: psData?.customer?.id as string ?? metadata.customerId as string ?? '',
          amount: (psData?.amount as number) ?? 0,
          currency: (psData?.currency as string) ?? 'NGN',
          metadata: {
            invoiceId: metadata.invoiceId as string,
            subscriptionId: metadata.subscriptionId as string,
            tenantId: metadata.tenantId as string,
            paystackId: psData?.id,
          },
          rawPayload: parsed,
        };
      }

      case 'charge.failure': {
        return {
          id: (psData?.id as string) ?? `ps_cf_${Date.now()}`,
          type: 'payment.failed',
          transactionId: (psData?.reference as string) ?? '',
          customerId: psData?.customer?.id as string ?? metadata.customerId as string ?? '',
          amount: (psData?.amount as number) ?? 0,
          currency: (psData?.currency as string) ?? 'NGN',
          metadata: {
            invoiceId: metadata.invoiceId as string,
            subscriptionId: metadata.subscriptionId as string,
            tenantId: metadata.tenantId as string,
            failureCode: (psData?.gateway_response as string) ?? 'unknown',
            failureMessage: (psData?.failure_message as string) ?? (psData?.gateway_response as string) ?? 'Payment failed',
          },
          rawPayload: parsed,
        };
      }

      case 'refund.processed':
      case 'refund.pending': {
        return {
          id: (psData?.id as string) ?? `ps_rf_${Date.now()}`,
          type: 'payment.refunded',
          transactionId: (psData?.transaction?.reference as string) ?? (psData?.reference as string) ?? '',
          amount: (psData?.amount as number) ?? 0,
          currency: (psData?.currency as string) ?? 'NGN',
          metadata: {
            chargeId: metadata.chargeId as string,
            reason: psData?.reason as string,
          },
          rawPayload: parsed,
        };
      }

      case 'chargeback.create': {
        return {
          id: (psData?.id as string) ?? `ps_cb_${Date.now()}`,
          type: 'chargeback.opened',
          transactionId: (psData?.transaction?.reference as string) ?? (psData?.reference as string) ?? '',
          amount: (psData?.amount as number) ?? 0,
          currency: (psData?.currency as string) ?? 'NGN',
          metadata: {
            invoiceId: metadata.invoiceId as string,
            reason: psData?.reason as string,
          },
          rawPayload: parsed,
        };
      }

      default:
        logger.warn({ event: psEvent }, 'Unsupported Paystack webhook event');
        throw new WebhookVerificationError(`Unsupported event: ${psEvent}`);
    }
  }

  async createCustomer(customerDetails: CreateCustomerInput): Promise<CustomerResult> {
    const result = await this.client.createCustomer(customerDetails);
    return { customerId: result.customerCode };
  }

  async attachPaymentMethod(_customerId: string, _methodToken: string): Promise<PaymentMethodResult> {
    logger.warn({ customerId: _customerId }, 'Paystack: attachPaymentMethod is not directly supported. Payment methods are created during checkout.');

    const existing = await this.client.getTransactionStatus(_methodToken);
    return {
      methodId: existing.status === 'succeeded' ? _methodToken : '',
      isPrimary: existing.status === 'succeeded',
    };
  }

  async getTransactionStatus(transactionId: string): Promise<TransactionStatus> {
    const result = await this.client.getTransactionStatus(transactionId);
    return {
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      paidAt: result.paidAt,
      failureCode: result.failureCode,
      failureMessage: result.failureMessage,
    };
  }
}
