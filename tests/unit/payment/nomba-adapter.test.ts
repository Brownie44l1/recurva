import { describe, it, expect } from 'bun:test';
import { NombaAdapter } from '../../../src/domain/payment/nomba.adapter';
import { WebhookVerificationError } from '../../../src/domain/payment/payment-processor.interface';
import { config } from '../../../src/config';
import * as crypto from 'crypto';

const WEBHOOK_SECRET = config.NOMBA_WEBHOOK_SECRET || 'NombaHackathon2026';

function signRaw(body: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

function buildChargeSuccessPayload(overrides: Record<string, unknown> = {}) {
  const eventId = `evt_cs_${Date.now()}`;
  return {
    event: 'charge.success',
    eventId,
    timestamp: new Date().toISOString(),
    data: {
      transactionId: `txn_cs_${Date.now()}`,
      invoiceId: '00000000-0000-0000-0000-000000000000',
      subscriptionId: '00000000-0000-0000-0000-000000000000',
      tenantId: '00000000-0000-0000-0000-000000000000',
      amount: 5000,
      currency: 'NGN',
      ...overrides,
    },
  };
}

function buildChargeFailurePayload(overrides: Record<string, unknown> = {}) {
  const eventId = `evt_cf_${Date.now()}`;
  return {
    event: 'charge.failure',
    eventId,
    timestamp: new Date().toISOString(),
    data: {
      transactionId: `txn_cf_${Date.now()}`,
      invoiceId: '00000000-0000-0000-0000-000000000000',
      subscriptionId: '00000000-0000-0000-0000-000000000000',
      tenantId: '00000000-0000-0000-0000-000000000000',
      failureCode: 'card_declined',
      failureMessage: 'Card was declined',
      ...overrides,
    },
  };
}

function buildRefundCompletedPayload(overrides: Record<string, unknown> = {}) {
  const eventId = `evt_rf_${Date.now()}`;
  return {
    event: 'refund.completed',
    eventId,
    timestamp: new Date().toISOString(),
    data: {
      transactionId: `txn_rf_${Date.now()}`,
      chargeId: 'charge_001',
      amount: 5000,
      reason: 'Customer request',
      ...overrides,
    },
  };
}

function buildChargebackOpenedPayload(overrides: Record<string, unknown> = {}) {
  const eventId = `evt_cb_${Date.now()}`;
  return {
    event: 'chargeback.opened',
    eventId,
    timestamp: new Date().toISOString(),
    data: {
      transactionId: `txn_cb_${Date.now()}`,
      invoiceId: '00000000-0000-0000-0000-000000000000',
      amount: 5000,
      reason: 'Customer dispute',
      ...overrides,
    },
  };
}

function buildCheckoutCallbackPayload(overrides: Record<string, unknown> = {}) {
  const data = {
    orderReference: 'ref_test_123',
    status: 'success' as const,
    token: 'tok_test_abc',
    last4: '4242',
    cardBrand: 'visa',
    expMonth: 12,
    expYear: 2028,
    amount: 5000,
    currency: 'NGN',
    transactionId: `txn_co_${Date.now()}`,
    ...overrides,
  };
  const event = 'checkout.completed';
  const canonical = [event, data.orderReference, data.transactionId, String(data.amount), data.currency].join(':');
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(canonical).digest('hex');
  const payload = { event, data, signature };
  return { payload, data };
}

describe('NombaAdapter.handleWebhook', () => {
  describe('charge.success → payment.succeeded', () => {
    it('returns normalized payment.succeeded for valid charge.success', () => {
      const payload = buildChargeSuccessPayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = NombaAdapter.verifyAndParse(rawBody, signature);

      expect(event.type).toBe('payment.succeeded');
      expect(event.transactionId).toBe(payload.data.transactionId);
      expect(event.id).toBe(payload.eventId);
      expect(event.metadata.invoiceId).toBe(payload.data.invoiceId);
      expect(event.metadata.tenantId).toBe(payload.data.tenantId);
      expect(event.metadata.subscriptionId).toBe(payload.data.subscriptionId);
    });

    it('includes amount and currency when provided', () => {
      const payload = buildChargeSuccessPayload({ amount: 10000, currency: 'USD' });
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = NombaAdapter.verifyAndParse(rawBody, signature);

      expect(event.amount).toBe(10000);
      expect(event.currency).toBe('USD');
    });
  });

  describe('charge.failure → payment.failed', () => {
    it('returns normalized payment.failed for valid charge.failure', () => {
      const payload = buildChargeFailurePayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = NombaAdapter.verifyAndParse(rawBody, signature);

      expect(event.type).toBe('payment.failed');
      expect(event.transactionId).toBe(payload.data.transactionId);
      expect(event.metadata.failureCode).toBe('card_declined');
      expect(event.metadata.failureMessage).toBe('Card was declined');
    });
  });

  describe('refund.completed → payment.refunded', () => {
    it('returns normalized payment.refunded for valid refund.completed', () => {
      const payload = buildRefundCompletedPayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = NombaAdapter.verifyAndParse(rawBody, signature);

      expect(event.type).toBe('payment.refunded');
      expect(event.transactionId).toBe(payload.data.transactionId);
      expect(event.amount).toBe(5000);
      expect(event.metadata.chargeId).toBe('charge_001');
    });
  });

  describe('chargeback.opened', () => {
    it('returns normalized chargeback.opened for valid chargeback.opened', () => {
      const payload = buildChargebackOpenedPayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = NombaAdapter.verifyAndParse(rawBody, signature);

      expect(event.type).toBe('chargeback.opened');
      expect(event.transactionId).toBe(payload.data.transactionId);
      expect(event.metadata.reason).toBe('Customer dispute');
    });
  });

  describe('checkout.completed', () => {
    it('returns normalized checkout.completed for valid checkout callback', () => {
      const { payload, data } = buildCheckoutCallbackPayload();
      const rawBody = JSON.stringify(payload);
      const event = NombaAdapter.verifyAndParse(rawBody, payload.signature);

      expect(event.type).toBe('checkout.completed');
      expect(event.transactionId).toBe(data.transactionId);
      expect(event.metadata.orderReference).toBe(data.orderReference);
      expect(event.metadata.token).toBe(data.token);
      expect(event.metadata.last4).toBe(data.last4);
      expect(event.metadata.cardBrand).toBe(data.cardBrand);
    });
  });

  describe('signature verification', () => {
    it('throws WebhookVerificationError for invalid signature on charge event', () => {
      const payload = buildChargeSuccessPayload();
      const rawBody = JSON.stringify(payload);
      const wrongSig = 'a'.repeat(64);

      expect(() => NombaAdapter.verifyAndParse(rawBody, wrongSig)).toThrow(WebhookVerificationError);
    });

    it('throws WebhookVerificationError for missing signature on charge event', () => {
      const payload = buildChargeSuccessPayload();
      const rawBody = JSON.stringify(payload);

      expect(() => NombaAdapter.verifyAndParse(rawBody, '')).toThrow(WebhookVerificationError);
    });

    it('throws WebhookVerificationError for invalid signature on checkout callback', () => {
      const { payload } = buildCheckoutCallbackPayload();
      const rawBody = JSON.stringify(payload);
      const wrongSig = 'a'.repeat(64);

      expect(() => NombaAdapter.verifyAndParse(rawBody, wrongSig)).toThrow(WebhookVerificationError);
    });

    it('throws WebhookVerificationError for tampered charge payload', () => {
      const payload = buildChargeSuccessPayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);

      const tampered = { ...payload, data: { ...payload.data, amount: 99999 } };
      const tamperedBody = JSON.stringify(tampered);

      expect(() => NombaAdapter.verifyAndParse(tamperedBody, signature)).toThrow(WebhookVerificationError);
    });

    it('throws WebhookVerificationError for invalid JSON', () => {
      expect(() => NombaAdapter.verifyAndParse('not-json', 'abc')).toThrow(WebhookVerificationError);
    });
  });

  describe('unsupported events', () => {
    it('throws WebhookVerificationError for unknown event type', () => {
      const payload = { event: 'unknown.event', eventId: 'evt_001', data: {} };
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);

      expect(() => NombaAdapter.verifyAndParse(rawBody, signature)).toThrow(WebhookVerificationError);
    });
  });

  describe('rawPayload preservation', () => {
    it('preserves the original raw payload in the event', () => {
      const payload = buildChargeSuccessPayload();
      const rawBody = JSON.stringify(payload);
      const signature = signRaw(rawBody);
      const event = NombaAdapter.verifyAndParse(rawBody, signature);

      expect(event.rawPayload).toEqual(payload);
    });
  });
});
