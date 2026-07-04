import { describe, it, expect, mock } from 'bun:test';

const mockCaptureException = mock(() => {});

mock.module('@sentry/node', () => ({
  captureException: mockCaptureException,
}));

import { reportBillingError } from '../../../src/observability/report-error';

describe('reportBillingError', () => {
  it('calls Sentry.captureException when err is present', () => {
    mockCaptureException.mockClear();

    const err = new Error('test error');
    reportBillingError({ tenantId: 't1', invoiceId: 'inv1' }, 'Test billing error', err);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(err, {
      extra: { tenantId: 't1', invoiceId: 'inv1', message: 'Test billing error' },
    });
  });

  it('skips Sentry.captureException when err is not provided', () => {
    mockCaptureException.mockClear();

    reportBillingError({ status: 500 }, 'Nomba API error');

    expect(mockCaptureException).toHaveBeenCalledTimes(0);
  });
});
