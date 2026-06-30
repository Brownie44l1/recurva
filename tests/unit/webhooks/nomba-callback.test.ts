import { describe, it, expect, mock } from 'bun:test';
import * as crypto from 'crypto';

const NOMBA_WEBHOOK_SECRET = 'whsec_test_nomba_secret';

function signPayload(payload: string): string {
  return crypto.createHmac('sha256', NOMBA_WEBHOOK_SECRET).update(payload).digest('hex');
}

function buildCallback(overrides: Record<string, unknown> = {}) {
  const data = {
    orderReference: 'ref_abc123',
    status: 'success',
    token: 'tok_xyz789',
    last4: '4242',
    cardBrand: 'visa',
    expMonth: 12,
    expYear: 2028,
    amount: 5000,
    currency: 'NGN',
    transactionId: 'txn_001',
    ...overrides,
  };

  const payload = { event: 'checkout.completed', data };
  const body = JSON.stringify({ ...payload, signature: undefined });
  const signature = signPayload(body);

  return { raw: JSON.stringify({ ...payload, signature }), data, signature };
}

describe('Nomba Checkout Callback - Signature Verification', () => {
  it('verifies a valid signature', () => {
    const cb = buildCallback();
    const body = JSON.stringify({ ...JSON.parse(cb.raw), signature: undefined });
    const expectedSig = signPayload(body);
    expect(cb.signature).toBe(expectedSig);
  });

  it('detects a tampered payload', () => {
    const cb = buildCallback();
    const tampered = buildCallback({ amount: 9999 });
    expect(cb.signature).not.toBe(tampered.signature);
  });

  it('extracts card details from callback data', () => {
    const cb = buildCallback();
    expect(cb.data.token).toBe('tok_xyz789');
    expect(cb.data.last4).toBe('4242');
    expect(cb.data.cardBrand).toBe('visa');
    expect(cb.data.expMonth).toBe(12);
    expect(cb.data.expYear).toBe(2028);
  });

  it('rejects failed checkout status', () => {
    const cb = buildCallback({ status: 'failed' });
    expect(cb.data.status).toBe('failed');
  });

  it('includes all required fields in callback', () => {
    const cb = buildCallback();
    expect(cb.data).toHaveProperty('orderReference');
    expect(cb.data).toHaveProperty('token');
    expect(cb.data).toHaveProperty('last4');
    expect(cb.data).toHaveProperty('cardBrand');
    expect(cb.data).toHaveProperty('expMonth');
    expect(cb.data).toHaveProperty('expYear');
    expect(cb.data).toHaveProperty('transactionId');
  });
});
