import type { SubscriptionStatus, SubscriptionEvent } from './subscription.types';
import { InvalidTransitionError } from '../../errors';

export type SideEffect =
  | 'BILL_NOW'
  | 'ACTIVATE'
  | 'START_DUNNING'
  | 'CANCEL_IMMEDIATELY'
  | 'SCHEDULE_CANCELLATION'
  | 'PAUSE_TRIAL'
  | 'PAUSE_BILLING'
  | 'CLEAR_DUNNING'
  | 'NOTIFY_TENANT'
  | 'RESUME_BILLING'
  | 'CREATE_NEW_CYCLE';

export interface TransitionResult {
  nextState: SubscriptionStatus;
  sideEffects: SideEffect[];
}

const TRANSITION_TABLE: Record<SubscriptionStatus, Partial<Record<SubscriptionEvent, TransitionResult>>> = {
  trialing: {
    TRIAL_END: { nextState: 'active', sideEffects: ['BILL_NOW'] },
    PAYMENT_SUCCESS: { nextState: 'active', sideEffects: ['ACTIVATE'] },
    PAYMENT_FAILED: { nextState: 'past_due', sideEffects: ['START_DUNNING'] },
    CANCEL: { nextState: 'cancelled', sideEffects: ['CANCEL_IMMEDIATELY'] },
    PAUSE: { nextState: 'paused', sideEffects: ['PAUSE_TRIAL'] },
  },
  active: {
    PAYMENT_FAILED: { nextState: 'past_due', sideEffects: ['START_DUNNING'] },
    CANCEL: { nextState: 'cancelled', sideEffects: ['SCHEDULE_CANCELLATION'] },
    PAUSE: { nextState: 'paused', sideEffects: ['PAUSE_BILLING'] },
  },
  past_due: {
    PAYMENT_SUCCESS: { nextState: 'active', sideEffects: ['CLEAR_DUNNING', 'ACTIVATE'] },
    MAX_DUNNING_REACHED: { nextState: 'cancelled', sideEffects: ['CANCEL_IMMEDIATELY', 'NOTIFY_TENANT'] },
    CANCEL: { nextState: 'cancelled', sideEffects: ['CANCEL_IMMEDIATELY'] },
  },
  paused: {
    RESUME: { nextState: 'active', sideEffects: ['RESUME_BILLING'] },
    CANCEL: { nextState: 'cancelled', sideEffects: ['CANCEL_IMMEDIATELY'] },
  },
  cancelled: {
    REACTIVATE: { nextState: 'active', sideEffects: ['CREATE_NEW_CYCLE'] },
  },
  ended: {},
  unpaid: {
    PAYMENT_SUCCESS: { nextState: 'active', sideEffects: ['ACTIVATE'] },
    MAX_DUNNING_REACHED: { nextState: 'cancelled', sideEffects: ['CANCEL_IMMEDIATELY'] },
  },
};

export function applyTransition(
  currentState: SubscriptionStatus,
  event: SubscriptionEvent,
): TransitionResult {
  const stateTransitions = TRANSITION_TABLE[currentState];
  const result = stateTransitions?.[event];

  if (!result) {
    throw new InvalidTransitionError(currentState, event);
  }

  return result;
}
