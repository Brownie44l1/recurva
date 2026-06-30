import { describe, it, expect } from 'bun:test';
import { signPayload } from '../../../src/domain/webhook/webhook.service';

describe('Webhook Signature', () => {
  it('signs payloads with HMAC-SHA256', () => {
    const secret = 'whsec_test_secret';
    const payload = JSON.stringify({ event: 'test', data: { id: '123' } });

    const signature = signPayload(secret, payload);

    expect(signature).toStartWith('sha256=');
    expect(signature.length).toBe(64 + 7); // sha256= + 64 hex chars
  });

  it('produces different signatures for different payloads', () => {
    const secret = 'whsec_test_secret';

    const sig1 = signPayload(secret, 'payload1');
    const sig2 = signPayload(secret, 'payload2');

    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different secrets', () => {
    const payload = 'test payload';

    const sig1 = signPayload('secret1', payload);
    const sig2 = signPayload('secret2', payload);

    expect(sig1).not.toBe(sig2);
  });
});
