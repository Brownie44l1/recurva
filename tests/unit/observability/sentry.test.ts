import { describe, it, expect, mock } from 'bun:test';

const mockInit = mock(() => {});

mock.module('@sentry/node', () => ({
  init: mockInit,
}));

describe('initSentry', () => {
  it('skips Sentry.init when SENTRY_DSN is not set', async () => {
    mockInit.mockClear();

    const { initSentry } = await import('../../../src/observability/sentry');
    initSentry();

    expect(mockInit).toHaveBeenCalledTimes(0);
  });
});
