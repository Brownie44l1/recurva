import { describe, it, expect, beforeAll } from 'bun:test';
import { PaystackAdapter } from '../../../src/domain/payment/paystack.adapter';
import { WebhookVerificationError } from '../../../src/domain/payment/payment-processor.interface';
import type { Tenant } from '../../../src/domain/tenant/tenant.types';
import * as crypto from 'crypto';

process.env.PAYSTACK_WEBHOOK_SECRET = 'paystack_test_secret';

const WEBHOOK_SECRET = 'paystack_test_secret';

function signRaw(body: string): string {
  return crypto.createHmac('sha512', WEBHOOK_SECRET).update(body).digest('hex');
}

function buildChargeSuccessPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'charge.success',
    data: {
      id: 12345,
      reference: `ref_ps_cs_${Date.now()}`,
      amount: 500000,
      currency: 'NGN',
      status: 'success',
      gateway_response: 'Successful',
      customer: { id: 98765, email: 'customer@test.com' },
      metadata: {
        invoiceId: '00000000-0000-0000-0000-000000000000',
        subscriptionId: '00000000-0000-0000-0000-000000000000',
        tenantId: '00000000-0000-0000-0000-000000000000',
      },
      ...overrides,
    },
  };
}

function buildChargeFailurePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'charge.failure',
    data: {
      id: 12346,
      reference: `ref_ps_cf_${Date.now()}`,
      amount: 500000,
      currency: 'NGN',
      status: 'failed',
      gateway_response: 'Declined',
      failure_message: 'Card declined by issuer',
      customer: { id: 98765, email: 'customer@test.com' },
      metadata: {
        invoiceId: '00000000-0000-0000-0000-000000000000',
        subscriptionId: '00000000-0000-0000-0000-000000000000',
        tenantId: '00000000-0000-0000-0000-000000000000',
      },
      ...overrides,
    },
  };
}

function buildRefundProcessedPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'refund.processed',
    data: {
      id: 54321,
      reference: `ref_ps_rf_${Date.now()}`,
      amount: 500000,
      currency: 'NGN',
      status: 'success',
      transaction: { reference: 'orig_txn_ref' },
      reason: 'Customer request',
      ...overrides,
    },
  };
}

function buildChargebackCreatePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'chargeback.create',
    data: {
      id: 99999,
      reference: `ref_ps_cb_${Date.now()}`,
      amount: 500000,
      currency: 'NGN',
      status: 'pending',
      transaction: { reference: 'orig_txn_ref' },
      reason: 'Customer dispute',
      ...overrides,
    },
  };
}

const mockTenant: Tenant = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Test Tenant',
  email: 'test@example.com',
  nombaAccountId: 'acc_test',
  webhookSecret: 'test_secret',
  mode: 'test',
  isActive: true,
  preferredProcessor: 'paystack',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PaystackAdapter.handleWebhook', () => {
  describe('charge.success → payment.succeeded', () => {
    it('returns normalized payment.succeeded for valid charge.success', () => {
      const payload = buildChargeSuccessPayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = PaystackAdapter.verifyAndParse(rawBody, signature);

      expect(event.type).toBe('payment.succeeded');
      expect(event.transactionId).toBe(payload.data.reference);
      expect(event.amount).toBe(500000);
      expect(event.currency).toBe('NGN');
      expect(event.metadata.invoiceId).toBe(payload.data.metadata.invoiceId);
      expect(event.metadata.tenantId).toBe(payload.data.metadata.tenantId);
      expect(event.metadata.subscriptionId).toBe(payload.data.metadata.subscriptionId);
    });
  });

  describe('charge.failure → payment.failed', () => {
    it('returns normalized payment.failed for valid charge.failure', () => {
      const payload = buildChargeFailurePayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = PaystackAdapter.verifyAndParse(rawBody, signature);

      expect(event.type).toBe('payment.failed');
      expect(event.transactionId).toBe(payload.data.reference);
      expect(event.metadata.failureCode).toBe('Declined');
      expect(event.metadata.failureMessage).toBe('Card declined by issuer');
    });
  });

  describe('refund.processed → payment.refunded', () => {
    it('returns normalized payment.refunded for valid refund.processed', () => {
      const payload = buildRefundProcessedPayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = PaystackAdapter.verifyAndParse(rawBody, signature);

      expect(event.type).toBe('payment.refunded');
      expect(event.transactionId).toBe('orig_txn_ref');
      expect(event.amount).toBe(500000);
    });
  });

  describe('refund.pending → payment.refunded', () => {
    it('handles refund.pending as payment.refunded', () => {
      const payload = buildRefundProcessedPayload();
      payload.event = 'refund.pending';
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = PaystackAdapter.verifyAndParse(rawBody, signature);

      expect(event.type).toBe('payment.refunded');
    });
  });

  describe('chargeback.create → chargeback.opened', () => {
    it('returns normalized chargeback.opened for valid chargeback.create', () => {
      const payload = buildChargebackCreatePayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = PaystackAdapter.verifyAndParse(rawBody, signature);

      expect(event.type).toBe('chargeback.opened');
      expect(event.transactionId).toBe('orig_txn_ref');
      expect(event.metadata.reason).toBe('Customer dispute');
    });
  });

  describe('signature verification', () => {
    it('throws WebhookVerificationError for invalid signature', () => {
      const payload = buildChargeSuccessPayload();
      const rawBody = JSON.stringify(payload);
      const wrongSig = 'a'.repeat(128);

      expect(() => PaystackAdapter.verifyAndParse(rawBody, wrongSig)).toThrow(WebhookVerificationError);
    });

    it('throws WebhookVerificationError for missing signature', () => {
      const payload = buildChargeSuccessPayload();
      const rawBody = JSON.stringify(payload);

      expect(() => PaystackAdapter.verifyAndParse(rawBody, '')).toThrow(WebhookVerificationError);
    });

    it('throws WebhookVerificationError for tampered payload', () => {
      const payload = buildChargeSuccessPayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);

      const tampered = { ...payload, data: { ...payload.data, amount: 99999 } };
      const tamperedBody = JSON.stringify(tampered);

      expect(() => PaystackAdapter.verifyAndParse(tamperedBody, signature)).toThrow(WebhookVerificationError);
    });

    it('throws WebhookVerificationError for invalid JSON', () => {
      expect(() => PaystackAdapter.verifyAndParse('not-json', 'abc')).toThrow(WebhookVerificationError);
    });
  });

  describe('unsupported events', () => {
    it('throws WebhookVerificationError for unknown event type', () => {
      const payload = { event: 'unknown.event', data: {} };
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);

      expect(() => PaystackAdapter.verifyAndParse(rawBody, signature)).toThrow(WebhookVerificationError);
    });
  });

  describe('rawPayload preservation', () => {
    it('preserves the original raw payload', () => {
      const payload = buildChargeSuccessPayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = PaystackAdapter.verifyAndParse(rawBody, signature);

      expect(event.rawPayload).toEqual(payload);
    });
  });
});

describe('PaystackAdapter.supportsCurrency', () => {
  const adapter = new PaystackAdapter(mockTenant);

  it('returns true for NGN', () => {
    expect(adapter.supportsCurrency('NGN')).toBe(true);
  });

  it('returns true for USD', () => {
    expect(adapter.supportsCurrency('USD')).toBe(true);
  });

  it('returns true for GHS', () => {
    expect(adapter.supportsCurrency('GHS')).toBe(true);
  });

  it('returns true for ZAR', () => {
    expect(adapter.supportsCurrency('ZAR')).toBe(true);
  });

  it('returns true for KES', () => {
    expect(adapter.supportsCurrency('KES')).toBe(true);
  });

  it('returns false for unsupported currency', () => {
    expect(adapter.supportsCurrency('EUR')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(adapter.supportsCurrency('ngn')).toBe(true);
    expect(adapter.supportsCurrency('usd')).toBe(true);
  });
});
