import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Track calls to each handler
const calls: Record<string, Array<unknown[]>> = {};

function track(name: string, ...args: unknown[]) {
  if (!calls[name]) calls[name] = [];
  calls[name].push(args);
}

// @ts-expect-error - mock.module must be called before module imports
mock.module('../../../src/domain/billing/billing.service', () => ({
  billSubscription: mock((...args: unknown[]) => {
    track('billSubscription', ...args);
    return Promise.resolve({ success: true, invoiceId: '', chargeId: null, status: 'paid' as const });
  }),
}));

// @ts-expect-error - mock.module
mock.module('../../../src/domain/dunning/dunning.service', () => ({
  initiateDunning: mock((...args: unknown[]) => {
    track('initiateDunning', ...args);
    return Promise.resolve([]);
  }),
}));

// @ts-expect-error - mock.module
mock.module('../../../src/domain/webhook/webhook.service', () => ({
  enqueueEvent: mock((...args: unknown[]) => {
    track('enqueueEvent', ...args);
    return Promise.resolve();
  }),
}));

// @ts-expect-error - mock.module
mock.module('../../../src/db/queries/dunning.queries', () => ({
  cancelScheduledDunning: mock((...args: unknown[]) => {
    track('cancelScheduledDunning', ...args);
    return Promise.resolve();
  }),
}));

import { executeSideEffects } from '../../../src/domain/subscription/side-effect.dispatcher';

function makeSql() {
  return {} as any;
}

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    tenantId: 'tenant-1',
    customerId: 'cust-1',
    planId: 'plan-1',
    currency: 'NGN',
    status: 'active',
    paymentMethodId: 'pm-1',
    couponId: null,
    trialStart: null,
    trialEnd: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    cancelledAt: null,
    cancelAtPeriodEnd: false,
    creditBalance: 0,
    dunningPolicyId: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Side Effect Dispatcher', () => {
  beforeEach(() => {
    Object.keys(calls).forEach((k) => delete calls[k]);
  });

  it('dispatches BILL_NOW to billSubscription', async () => {
    await executeSideEffects(makeSql(), 'tenant-1', makeSub(), ['BILL_NOW'], { actorType: 'system', actorId: 'test' });
    expect(calls['billSubscription']).toHaveLength(1);
  });

  it('dispatches START_DUNNING with invoiceId to initiateDunning', async () => {
    await executeSideEffects(
      makeSql(), 'tenant-1', makeSub(), ['START_DUNNING'],
      { actorType: 'system', actorId: 'test' },
      { invoiceId: 'inv-1' },
    );
    expect(calls['initiateDunning']).toHaveLength(1);
    expect(calls['initiateDunning'][0]).toContain('inv-1');
  });

  it('dispatches ACTIVATE to enqueueEvent with subscription.activated', async () => {
    await executeSideEffects(makeSql(), 'tenant-1', makeSub(), ['ACTIVATE'], { actorType: 'system', actorId: 'test' });
    expect(calls['enqueueEvent']).toHaveLength(1);
    expect(calls['enqueueEvent'][0][2]).toBe('subscription.activated');
  });

  it('dispatches NOTIFY_TENANT to enqueueEvent with subscription.notification', async () => {
    await executeSideEffects(makeSql(), 'tenant-1', makeSub({ status: 'unpaid' }), ['NOTIFY_TENANT'], { actorType: 'system', actorId: 'test' });
    expect(calls['enqueueEvent']).toHaveLength(1);
    expect(calls['enqueueEvent'][0][2]).toBe('subscription.notification');
  });

  it('dispatches CLEAR_DUNNING to cancelScheduledDunning', async () => {
    await executeSideEffects(makeSql(), 'tenant-1', makeSub(), ['CLEAR_DUNNING'], { actorType: 'system', actorId: 'test' });
    expect(calls['cancelScheduledDunning']).toHaveLength(1);
  });

  it('dispatches CANCEL_IMMEDIATELY to cancelScheduledDunning and enqueueEvent', async () => {
    await executeSideEffects(makeSql(), 'tenant-1', makeSub(), ['CANCEL_IMMEDIATELY'], {
      actorType: 'system', actorId: 'test', reason: 'payment_delinquent',
    });
    expect(calls['cancelScheduledDunning']).toHaveLength(1);
    expect(calls['enqueueEvent']).toHaveLength(1);
    expect(calls['enqueueEvent'][0][2]).toBe('subscription.cancelled');
  });

  it('dispatches CREATE_NEW_CYCLE to enqueueEvent with subscription.reactivated', async () => {
    await executeSideEffects(makeSql(), 'tenant-1', makeSub(), ['CREATE_NEW_CYCLE'], { actorType: 'system', actorId: 'test' });
    expect(calls['enqueueEvent']).toHaveLength(1);
    expect(calls['enqueueEvent'][0][2]).toBe('subscription.reactivated');
  });

  it('does not throw for SCHEDULE_CANCELLATION (declared but no handler)', async () => {
    await expect(
      executeSideEffects(makeSql(), 'tenant-1', makeSub(), ['SCHEDULE_CANCELLATION'], { actorType: 'system', actorId: 'test' }),
    ).resolves.toBeUndefined();
  });

  it('does not throw for PAUSE_TRIAL (declared but no handler)', async () => {
    await expect(
      executeSideEffects(makeSql(), 'tenant-1', makeSub(), ['PAUSE_TRIAL'], { actorType: 'system', actorId: 'test' }),
    ).resolves.toBeUndefined();
  });

  it('does not throw for PAUSE_BILLING (declared but no handler)', async () => {
    await expect(
      executeSideEffects(makeSql(), 'tenant-1', makeSub(), ['PAUSE_BILLING'], { actorType: 'system', actorId: 'test' }),
    ).resolves.toBeUndefined();
  });

  it('does not throw for RESUME_BILLING (declared but no handler)', async () => {
    await expect(
      executeSideEffects(makeSql(), 'tenant-1', makeSub(), ['RESUME_BILLING'], { actorType: 'system', actorId: 'test' }),
    ).resolves.toBeUndefined();
  });

  it('handles multiple side effects in sequence', async () => {
    await executeSideEffects(
      makeSql(), 'tenant-1', makeSub(), ['CLEAR_DUNNING', 'ACTIVATE'],
      { actorType: 'system', actorId: 'test' },
    );
    expect(calls['cancelScheduledDunning']).toHaveLength(1);
    expect(calls['enqueueEvent']).toHaveLength(1);
  });
});
