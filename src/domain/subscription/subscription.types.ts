export type SubscriptionStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'cancelled'
  | 'ended'
  | 'unpaid';

export type SubscriptionEvent =
  | 'TRIAL_END'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'CHECKOUT_COMPLETED'
  | 'CANCEL'
  | 'PAUSE'
  | 'RESUME'
  | 'MAX_DUNNING_REACHED'
  | 'REACTIVATE'
  | 'CHANGE_PLAN'
  | 'GRACE_PERIOD_ENDED';

export interface ChangePlanInput {
  newPlanId: string;
  immediate: boolean;
}

export interface Subscription {
  id: string;
  tenantId: string;
  customerId: string;
  planId: string;
  currency: string;
  status: SubscriptionStatus;
  paymentMethodId: string | null;
  couponId: string | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt: Date | null;
  cancelAtPeriodEnd: boolean;
  creditBalance: number;
  dunningPolicyId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
  currency: string;
  couponCode?: string;
  paymentMethodId?: string;
  trialDays?: number;
  metadata?: Record<string, unknown>;
}

export interface CancelOptions {
  cancelAtPeriodEnd?: boolean;
  reason?: string;
}

export interface TransitionContext {
  actorType: string;
  actorId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}
