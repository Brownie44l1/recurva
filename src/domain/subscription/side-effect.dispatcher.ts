import type { Sql } from 'postgres';
import type { Subscription, TransitionContext } from './subscription.types';
import type { SideEffect } from './subscription.state-machine';
import { billSubscription } from '../billing/billing.service';
import { initiateDunning } from '../dunning/dunning.service';
import { enqueueEvent } from '../webhook/webhook.service';

interface SideEffectContext {
  invoiceId?: string;
}

export async function executeSideEffects(
  sql: Sql,
  tenantId: string,
  subscription: Subscription,
  sideEffects: SideEffect[],
  context: TransitionContext,
  extra?: SideEffectContext,
): Promise<void> {
  for (const effect of sideEffects) {
    switch (effect) {
      case 'BILL_NOW':
        await billSubscription(sql, tenantId, subscription.id, context);
        break;

      case 'START_DUNNING':
        if (extra?.invoiceId) {
          await initiateDunning(sql, tenantId, subscription.id, extra.invoiceId);
        }
        break;

      case 'ACTIVATE':
        await enqueueEvent(sql, tenantId, 'subscription.activated', {
          subscriptionId: subscription.id,
          customerId: subscription.customerId,
        });
        break;

      case 'NOTIFY_TENANT':
        await enqueueEvent(sql, tenantId, 'subscription.notification', {
          subscriptionId: subscription.id,
          status: subscription.status,
        });
        break;

      default:
        break;
    }
  }
}
