import type { Sql, TransactionSql } from 'postgres';
import { withTransaction } from '../../db/transaction';
import type { BillingResult, BillingContext } from './billing.types';
import * as invoiceQueries from '../../db/queries/invoice.queries';
import * as subscriptionQueries from '../../db/queries/subscription.queries';
import * as paymentMethodQueries from '../../db/queries/payment-method.queries';
import * as tenantQueries from '../../db/queries/tenant.queries';
import { buildInvoice, finalizeInvoice } from '../invoice/invoice.service';
import { chargeCard } from '../nomba/nomba.service';
import { transitionState } from '../subscription/subscription.service';
import { executeSideEffects } from '../subscription/side-effect.dispatcher';

function asSql(tx: TransactionSql): Sql {
  return tx as unknown as Sql;
}

export async function billSubscription(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  context: BillingContext,
): Promise<BillingResult> {
  return withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const subscription = await subscriptionQueries.findSubscriptionForUpdate(s, tenantId, subscriptionId);
    if (!subscription) {
      return { success: false, invoiceId: '', chargeId: null, status: 'failed', failureReason: 'Subscription not found' };
    }

    const invoice = await buildInvoice(s, tenantId, subscription, {
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
    });

    const finalized = await finalizeInvoice(s, tenantId, invoice.id);

    if (finalized.status === 'paid') {
      return { success: true, invoiceId: invoice.id, chargeId: null, status: 'paid' };
    }

    const pm = subscription.paymentMethodId
      ? await paymentMethodQueries.findPaymentMethodById(s, tenantId, subscription.paymentMethodId)
      : null;

    if (!pm) {
      const { subscription: sub, sideEffects } = await transitionState(s, tenantId, subscriptionId, 'PAYMENT_FAILED', context);
      await executeSideEffects(s, tenantId, sub, sideEffects, context, { invoiceId: invoice.id });
      return { success: false, invoiceId: invoice.id, chargeId: null, status: 'dunning' };
    }

    const charge = await invoiceQueries.insertCharge(s, tenantId, {
      customerId: subscription.customerId,
      invoiceId: invoice.id,
      paymentMethodId: pm.id,
      currency: subscription.currency,
      amount: finalized.amountDue,
    });

    try {
      const tenant = await tenantQueries.findTenantById(s, tenantId);
      if (!tenant) {
        return { success: false, invoiceId: invoice.id, chargeId: charge.id, status: 'failed', failureReason: 'Tenant not found' };
      }

      const result = await chargeCard(tenant, {
        token: pm.nombaToken,
        amount: finalized.amountDue,
        currency: subscription.currency,
        transactionReference: charge.id,
        callbackUrl: '',
      });

      await invoiceQueries.updateChargeStatus(s, charge.id, 'succeeded', {
        nombaChargeId: result.chargeId,
        nombaReference: result.transactionId,
      });

      await invoiceQueries.updateInvoiceStatus(s, invoice.id, 'paid');

      const nextPeriodStart = new Date(subscription.currentPeriodEnd);
      const nextPeriodEnd = new Date(nextPeriodStart.getTime() + (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()));

      await subscriptionQueries.updateSubscriptionPeriod(s, tenantId, subscriptionId, nextPeriodStart, nextPeriodEnd);

      return { success: true, invoiceId: invoice.id, chargeId: charge.id, status: 'paid' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await invoiceQueries.updateChargeStatus(s, charge.id, 'failed', {
        failureMessage: message,
      });

      await transitionState(s, tenantId, subscriptionId, 'PAYMENT_FAILED', context);

      return { success: false, invoiceId: invoice.id, chargeId: charge.id, status: 'dunning', failureReason: message };
    }
  });
}

export async function retryCharge(
  sql: Sql,
  tenantId: string,
  invoiceId: string,
): Promise<BillingResult> {
  return withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const invoice = await invoiceQueries.findInvoiceById(s, tenantId, invoiceId);
    if (!invoice) {
      return { success: false, invoiceId: '', chargeId: null, status: 'failed', failureReason: 'Invoice not found' };
    }

    const subscription = await subscriptionQueries.findSubscriptionById(s, tenantId, invoice.subscriptionId);
    if (!subscription) {
      return { success: false, invoiceId: invoice.id, chargeId: null, status: 'failed', failureReason: 'Subscription not found' };
    }

    let pm = subscription.paymentMethodId
      ? await paymentMethodQueries.findPaymentMethodById(s, tenantId, subscription.paymentMethodId)
      : null;

    if (!pm) {
      pm = await paymentMethodQueries.findBackupPaymentMethod(s, tenantId, subscription.customerId);
    }
    const charge = await invoiceQueries.insertCharge(s, tenantId, {
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      paymentMethodId: pm?.id ?? null,
      currency: invoice.currency,
      amount: invoice.amountDue,
    });

    if (!pm) {
      await invoiceQueries.updateChargeStatus(s, charge.id, 'failed', {
        failureMessage: 'No payment method available',
      });
      return { success: false, invoiceId: invoice.id, chargeId: charge.id, status: 'failed', failureReason: 'No payment method available' };
    }

    try {
      const tenant = await tenantQueries.findTenantById(s, tenantId);
      if (!tenant) {
        return { success: false, invoiceId: invoice.id, chargeId: charge.id, status: 'failed', failureReason: 'Tenant not found' };
      }

      const result = await chargeCard(tenant, {
        token: pm.nombaToken,
        amount: invoice.amountDue,
        currency: invoice.currency,
        transactionReference: charge.id,
        callbackUrl: '',
      });

      await invoiceQueries.updateChargeStatus(s, charge.id, 'succeeded', {
        nombaChargeId: result.chargeId,
        nombaReference: result.transactionId,
      });

      await invoiceQueries.updateInvoiceStatus(s, invoice.id, 'paid');

      await transitionState(s, tenantId, subscription.id, 'PAYMENT_SUCCESS', { actorType: 'system', actorId: 'retry-charge' });
      return { success: true, invoiceId: invoice.id, chargeId: charge.id, status: 'paid' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await invoiceQueries.updateChargeStatus(s, charge.id, 'failed', {
        failureMessage: message,
      });

      return { success: false, invoiceId: invoice.id, chargeId: charge.id, status: 'dunning', failureReason: message };
    }
  });
}
