import { describe, it, expect, afterEach, mock } from 'bun:test';

mock.module('../../../src/config', () => ({
  config: {
    NOMBA_SANDBOX_BASE_URL: 'https://sandbox.nomba.com',
    NOMBA_LIVE_BASE_URL: 'https://api.nomba.com',
    NOMBA_PARENT_ACCOUNT_ID: 'pa_test',
    NOMBA_TEST_CLIENT_ID: 'test_client_id',
    NOMBA_TEST_PRIVATE_KEY: 'test_private_key',
    NOMBA_LIVE_CLIENT_ID: '',
    NOMBA_LIVE_PRIVATE_KEY: '',
    NOMBA_REQUEST_TIMEOUT_MS: 15000,
    NOMBA_CALLBACK_URL: 'https://example.com/callback',
  },
}));

import { createNombaClient } from '../../../src/nomba/client';

const originalFetch = globalThis.fetch;

function setupFetch(handler: (url: string, opts?: Record<string, unknown>) => Promise<Response>) {
  globalThis.fetch = mock(handler) as unknown as typeof fetch;
}

describe('Nomba Client - Per-Tenant Token Cache', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns distinct tokens for different tenants', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    // biome-ignore lint/suspicious/noExplicitAny: mock body parse
    setupFetch(async (url: string, opts?: any) => {
      calls.push({ url, method: opts?.method ?? 'GET' });
      if (url.includes('/auth/token/issue')) {
        const body = JSON.parse(opts?.body ?? '{}');
        const token = body.client_id === 'LIVE_CLIENT_ID_A' ? 'TOKEN_A' : 'TOKEN_B';
        return new Response(
          JSON.stringify({
            code: '200',
            data: { access_token: token, expires_at: new Date(Date.now() + 3600_000).toISOString() },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ code: '200', data: { status: true, message: 'OK', orderId: 'order-1', orderReference: 'txn-1' } }),
        { status: 200 },
      );
    });

    const clientA = createNombaClient({ id: 'tenant-a', nombaAccountId: 'acc_a', mode: 'test' as const });
    const clientB = createNombaClient({ id: 'tenant-b', nombaAccountId: 'acc_b', mode: 'test' as const });

    await clientA.charge({ token: 'tok_a', amount: 5000, currency: 'NGN', transactionReference: 'ref-a', callbackUrl: 'https://example.com/callback' });
    await clientB.charge({ token: 'tok_b', amount: 3000, currency: 'NGN', transactionReference: 'ref-b', callbackUrl: 'https://example.com/callback' });

    const tokenCalls = calls.filter((c) => c.url.includes('/auth/token/issue'));
    expect(tokenCalls.length).toBe(2);
  });

  it('reuses cached token for the same tenant on subsequent calls', async () => {
    let tokenCallCount = 0;
    setupFetch(async (url: string) => {
      if (url.includes('/auth/token/issue')) {
        tokenCallCount++;
        return new Response(
          JSON.stringify({
            code: '200',
            data: { access_token: 'CACHED_TOKEN', expires_at: new Date(Date.now() + 3600_000).toISOString() },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ code: '200', data: { status: true, message: 'OK', orderId: 'order-1', orderReference: 'txn-1' } }),
        { status: 200 },
      );
    });

    const client = createNombaClient({ id: 'tenant-cached', nombaAccountId: 'acc_cached', mode: 'test' as const });

    await client.charge({ token: 'tok_1', amount: 1000, currency: 'NGN', transactionReference: 'ref-1', callbackUrl: 'https://example.com/callback' });
    expect(tokenCallCount).toBe(1);

    await client.charge({ token: 'tok_2', amount: 2000, currency: 'NGN', transactionReference: 'ref-2', callbackUrl: 'https://example.com/callback' });
    expect(tokenCallCount).toBe(1);
  });

  it('does not share token cache between tenants with different IDs', async () => {
    let tokenCallCount = 0;
    setupFetch(async (url: string) => {
      if (url.includes('/auth/token/issue')) {
        tokenCallCount++;
        return new Response(
          JSON.stringify({
            code: '200',
            data: { access_token: `TOKEN_${tokenCallCount}`, expires_at: new Date(Date.now() + 3600_000).toISOString() },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ code: '200', data: { status: true, message: 'OK', orderId: 'order-1', orderReference: 'txn-1' } }),
        { status: 200 },
      );
    });

    const client1 = createNombaClient({ id: 'tenant-1', nombaAccountId: 'acc_1', mode: 'test' as const });
    const client2 = createNombaClient({ id: 'tenant-2', nombaAccountId: 'acc_2', mode: 'test' as const });

    await client1.charge({ token: 'tok', amount: 1000, currency: 'NGN', transactionReference: 'ref-1', callbackUrl: 'https://example.com/callback' });
    await client2.charge({ token: 'tok', amount: 1000, currency: 'NGN', transactionReference: 'ref-2', callbackUrl: 'https://example.com/callback' });

    expect(tokenCallCount).toBe(2);
  });

  it('handles charge call correctly through token auth flow', async () => {
    let tokenCalled = false;
    let chargeCalled = false;
    setupFetch(async (url: string) => {
      if (url.includes('/auth/token/issue')) {
        tokenCalled = true;
        return new Response(
          JSON.stringify({
            code: '200',
            data: { access_token: 'test_token', expires_at: new Date(Date.now() + 3600_000).toISOString() },
          }),
          { status: 200 },
        );
      }
      chargeCalled = true;
      return new Response(
        JSON.stringify({ code: '200', data: { status: true, message: 'OK', orderId: 'order-test', orderReference: 'txn-test' } }),
        { status: 200 },
      );
    });

    const client = createNombaClient({ id: 'tenant-flow', nombaAccountId: 'acc_flow', mode: 'test' as const });

    const result = await client.charge({
      token: 'tok',
      amount: 1000,
      currency: 'NGN',
      transactionReference: 'ref-flow',
      callbackUrl: 'https://example.com/callback',
    });

    expect(tokenCalled).toBe(true);
    expect(chargeCalled).toBe(true);
    expect(result.status).toBe('succeeded');
  });
});
