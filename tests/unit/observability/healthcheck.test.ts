import { describe, it, expect, mock } from 'bun:test';

function mockFetch(impl: () => Promise<Response>): typeof globalThis.fetch {
  return mock(impl) as unknown as typeof globalThis.fetch;
}

describe('pingHealthcheck', () => {
  it('skips pinging when URL is not provided and config is empty', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(new Response()));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    const { pingHealthcheck } = await import('../../../src/scheduler/runner');
    await pingHealthcheck();

    expect(fetchMock).toHaveBeenCalledTimes(0);
    globalThis.fetch = originalFetch;
  });

  it('pings the given URL', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(new Response()));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    const { pingHealthcheck } = await import('../../../src/scheduler/runner');
    await pingHealthcheck('https://hc-ping.com/test-uuid');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://hc-ping.com/test-uuid', { method: 'GET' });

    globalThis.fetch = originalFetch;
  });

  it('does not throw when ping fails', async () => {
    const fetchMock = mockFetch(() => Promise.reject(new Error('Network error')));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    const { pingHealthcheck } = await import('../../../src/scheduler/runner');
    await pingHealthcheck('https://hc-ping.com/test-uuid');

    expect(fetchMock).toHaveBeenCalledTimes(1);

    globalThis.fetch = originalFetch;
  });
});
