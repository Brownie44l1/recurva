import { describe, it, expect } from 'bun:test';
import { applyTransition } from '../../../src/domain/subscription/subscription.state-machine';
import { InvalidTransitionError } from '../../../src/errors';

describe('Subscription State Machine', () => {
  describe('incomplete state', () => {
    it('transitions to active on CHECKOUT_COMPLETED', () => {
      const result = applyTransition('incomplete', 'CHECKOUT_COMPLETED');
      expect(result.nextState).toBe('active');
      expect(result.sideEffects).toContain('ACTIVATE');
    });

    it('transitions to cancelled on CANCEL', () => {
      const result = applyTransition('incomplete', 'CANCEL');
      expect(result.nextState).toBe('cancelled');
    });

    it('throws on invalid transition from incomplete', () => {
      expect(() => applyTransition('incomplete', 'PAUSE')).toThrow(InvalidTransitionError);
    });
  });

  describe('trialing state', () => {
    it('transitions to active on TRIAL_END', () => {
      const result = applyTransition('trialing', 'TRIAL_END');
      expect(result.nextState).toBe('active');
      expect(result.sideEffects).toContain('BILL_NOW');
    });

    it('transitions to active on PAYMENT_SUCCESS', () => {
      const result = applyTransition('trialing', 'PAYMENT_SUCCESS');
      expect(result.nextState).toBe('active');
      expect(result.sideEffects).toContain('ACTIVATE');
    });

    it('transitions to past_due on PAYMENT_FAILED', () => {
      const result = applyTransition('trialing', 'PAYMENT_FAILED');
      expect(result.nextState).toBe('past_due');
      expect(result.sideEffects).toContain('START_DUNNING');
    });

    it('transitions to cancelled on CANCEL', () => {
      const result = applyTransition('trialing', 'CANCEL');
      expect(result.nextState).toBe('cancelled');
    });

    it('transitions to paused on PAUSE', () => {
      const result = applyTransition('trialing', 'PAUSE');
      expect(result.nextState).toBe('paused');
    });
  });

  describe('active state', () => {
    it('transitions to past_due on PAYMENT_FAILED', () => {
      const result = applyTransition('active', 'PAYMENT_FAILED');
      expect(result.nextState).toBe('past_due');
    });

    it('transitions to cancelled on CANCEL', () => {
      const result = applyTransition('active', 'CANCEL');
      expect(result.nextState).toBe('cancelled');
    });

    it('transitions to paused on PAUSE', () => {
      const result = applyTransition('active', 'PAUSE');
      expect(result.nextState).toBe('paused');
    });
  });

  describe('past_due state', () => {
    it('transitions to active on PAYMENT_SUCCESS', () => {
      const result = applyTransition('past_due', 'PAYMENT_SUCCESS');
      expect(result.nextState).toBe('active');
    });

    it('transitions to cancelled on MAX_DUNNING_REACHED', () => {
      const result = applyTransition('past_due', 'MAX_DUNNING_REACHED');
      expect(result.nextState).toBe('cancelled');
    });

    it('transitions to cancelled on CANCEL', () => {
      const result = applyTransition('past_due', 'CANCEL');
      expect(result.nextState).toBe('cancelled');
    });
  });

  describe('paused state', () => {
    it('transitions to active on RESUME', () => {
      const result = applyTransition('paused', 'RESUME');
      expect(result.nextState).toBe('active');
    });

    it('transitions to cancelled on CANCEL', () => {
      const result = applyTransition('paused', 'CANCEL');
      expect(result.nextState).toBe('cancelled');
    });
  });

  describe('cancelled state', () => {
    it('transitions to active on REACTIVATE', () => {
      const result = applyTransition('cancelled', 'REACTIVATE');
      expect(result.nextState).toBe('active');
    });
  });

  describe('invalid transitions', () => {
    it('throws InvalidTransitionError for invalid transition', () => {
      expect(() => applyTransition('active', 'TRIAL_END')).toThrow(InvalidTransitionError);
    });

    it('throws when active gets REACTIVATE', () => {
      expect(() => applyTransition('active', 'REACTIVATE')).toThrow(InvalidTransitionError);
    });

    it('throws when trialing gets RESUME', () => {
      expect(() => applyTransition('trialing', 'RESUME')).toThrow(InvalidTransitionError);
    });

    it('throws when cancelled gets PAUSE', () => {
      expect(() => applyTransition('cancelled', 'PAUSE')).toThrow(InvalidTransitionError);
    });

    it('throws when incomplete gets RESUME', () => {
      expect(() => applyTransition('incomplete', 'RESUME')).toThrow(InvalidTransitionError);
    });
  });
});
