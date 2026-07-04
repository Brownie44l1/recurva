import type { Sql, TransactionSql } from 'postgres';
import { withTransaction } from '../../db/transaction';
import type { BillingResult, BillingContext } from './billing.types';
import * as invoiceQueries from '../../db/queries/invoice.queries';
import * as subscriptionQueries from '../../db/queries/subscription.queries';
import * as paymentMethodQueries from '../../db/queries/payment-method.queries';
import * as tenantQueries from '../../db/queries/tenant.queries';
import * as customerQueries from '../../db/queries/customer.queries';
import { buildInvoice, finalizeInvoice } from '../invoice/invoice.service';
import { getPaymentProcessor } from '../payment/payment.factory';
import { transitionState } from '../subscription/subscription.service';
import { executeSideEffects } from '../subscription/side-effect.dispatcher';
import { config } from '../../config';
import { createEmailClient } from '../../infrastructure/email/email.client';
import { createEmailService } from '../../infrastructure/email/email.service';
import type { EmailService } from '../../infrastructure/email/email.service';
import { logger } from '../../logger';

function asSql(tx: TransactionSql): Sql {
  return tx as unknown as Sql;
}

let _emailService: EmailService | null = null;

function getEmailService(): EmailService | null {
  if (!_emailService) {
    try {
      const client = createEmailClient(config.RESEND_API_KEY);
      _emailService = createEmailService({ client });
    } catch {
      logger.warn('Email service not available - email sending disabled');
      return null;
    }
  }
  return _emailService;
}

async function sendReceiptEmail(sql: Sql, tenantId: string, customerId: string, amount: number, currency: string, description: string): Promise<void> {
  const emailService = getEmailService();
  if (!emailService) return;

  try {
    const customer = await customerQueries.findCustomerById(sql, tenantId, customerId);
    if (!customer?.email) return;

    await emailService.sendPaymentReceipt(customer.email, {
      name: customer.name ?? 'Valued Customer',
      amount: (amount / 100).toFixed(2),
      currency,
      date: new Date().toLocaleDateString('en-GB'),
      receiptUrl: '',
      description,
    });
  } catch (err) {
    logger.error({ customerId, tenantId, err }, 'Failed to send payment receipt email');
  }
}

async function sendFailedEmail(sql: Sql, tenantId: string, customerId: string, amount: number, currency: string, reason: string): Promise<void> {
  const emailService = getEmailService();
  if (!emailService) return;

  try {
    const customer = await customerQueries.findCustomerById(sql, tenantId, customerId);
    if (!customer?.email) return;

    await emailService.sendPaymentFailedEmail(customer.email, {
      name: customer.name ?? 'Valued Customer',
      amount: (amount / 100).toFixed(2),
      currency,
      date: new Date().toLocaleDateString('en-GB'),
      retryUrl: '',
      reason,
    });
  } catch (err) {
    logger.error({ customerId, tenantId, err }, 'Failed to send payment failed email');
  }
}

async function decrementCreditForInvoice(
  sql: Sql,
  subscriptionId: string,
  total: number,
  amountDue: number,
): Promise<void> {
  const creditUsed = total - amountDue;
  if (creditUsed > 0) {
    await subscriptionQueries.decrementCreditBalance(sql, subscriptionId, creditUsed);
  }
}

export async function billSubscription(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  context: BillingContext,
): Promise<BillingResult> {
  let emailInfo: { customerId: string; amount: number; currency: string; invoiceId: string } | null = null;
  let chargeSucceeded = false;
  let chargeFailed = false;
  let failureReason: string | undefined;

  const result = await withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const subscription = await subscriptionQueries.findSubscriptionForUpdate(s, tenantId, subscriptionId);
    if (!subscription) {
      return { success: false, invoiceId: '', chargeId: null, status: 'failed', failureReason: 'Subscription not found' };
    }

    const invoice = await buildInvoice(s, tenantId, subscription, {
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      applyCoupon: true,
    });

    const finalized = await finalizeInvoice(s, tenantId, invoice.id);

    if (finalized.amountDue <= 0) {
      await invoiceQueries.updateInvoiceStatus(s, invoice.id, 'paid');
      await decrementCreditForInvoice(s, subscription.id, finalized.total, finalized.amountDue);

      const nextPeriodStart = new Date(subscription.currentPeriodEnd);
      const nextPeriodEnd = new Date(nextPeriodStart.getTime() + (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()));
      await subscriptionQueries.updateSubscriptionPeriod(s, tenantId, subscriptionId, nextPeriodStart, nextPeriodEnd);

      return { success: true, invoiceId: invoice.id, chargeId: null, status: 'paid' };
    }

    const pm = subscription.paymentMethodId
      ? await paymentMethodQueries.findPaymentMethodById(s, tenantId, subscription.paymentMethodId)
      : null;

    if (!pm) {
      emailInfo = { customerId: subscription.customerId, amount: 0, currency: subscription.currency, invoiceId: invoice.id };
      chargeFailed = true;
      failureReason = 'No payment method';
      const { subscription: sub, sideEffects } = await transitionState(s, tenantId, subscriptionId, 'PAYMENT_FAILED', context);
      await executeSideEffects(s, tenantId, sub, sideEffects, context, { invoiceId: invoice.id });
      return { success: false, invoiceId: invoice.id, chargeId: null, status: 'dunning' };
    }

    const pendingCharge = await invoiceQueries.findPendingChargeForInvoice(s, invoice.id);
    if (pendingCharge) {
      return { success: false, invoiceId: invoice.id, chargeId: pendingCharge.id, status: 'failed', failureReason: 'Charge already in progress' };
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

      const result = await getPaymentProcessor(tenant).charge({
        token: pm.nombaToken,
        amount: finalized.amountDue,
        currency: subscription.currency,
        transactionReference: charge.id,
        callbackUrl: config.NOMBA_CALLBACK_URL,
      });

      await invoiceQueries.updateChargeStatus(s, charge.id, 'succeeded', {
        nombaChargeId: result.chargeId,
        nombaReference: result.transactionId,
      });

      await invoiceQueries.updateInvoiceStatus(s, invoice.id, 'paid');
      await decrementCreditForInvoice(s, subscription.id, finalized.total, finalized.amountDue);

      const nextPeriodStart = new Date(subscription.currentPeriodEnd);
      const nextPeriodEnd = new Date(nextPeriodStart.getTime() + (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()));

      await subscriptionQueries.updateSubscriptionPeriod(s, tenantId, subscriptionId, nextPeriodStart, nextPeriodEnd);

      emailInfo = { customerId: subscription.customerId, amount: finalized.amountDue, currency: subscription.currency, invoiceId: invoice.id };
      chargeSucceeded = true;

      return { success: true, invoiceId: invoice.id, chargeId: charge.id, status: 'paid' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await invoiceQueries.updateChargeStatus(s, charge.id, 'failed', {
        failureMessage: message,
      });

      await transitionState(s, tenantId, subscriptionId, 'PAYMENT_FAILED', context);

      emailInfo = { customerId: subscription.customerId, amount: finalized.amountDue, currency: subscription.currency, invoiceId: invoice.id };
      chargeFailed = true;
      failureReason = message;

      return { success: false, invoiceId: invoice.id, chargeId: charge.id, status: 'dunning', failureReason: message };
    }
  });

  if (emailInfo) {
    if (chargeSucceeded) {
      await sendReceiptEmail(sql, tenantId, emailInfo.customerId, emailInfo.amount, emailInfo.currency, `Subscription payment for invoice ${emailInfo.invoiceId}`);
    } else if (chargeFailed) {
      await sendFailedEmail(sql, tenantId, emailInfo.customerId, emailInfo.amount, emailInfo.currency, failureReason ?? 'Payment failed');
    }
  }

  return result;
}

export async function retryCharge(
  sql: Sql,
  tenantId: string,
  invoiceId: string,
): Promise<BillingResult> {
  let emailInfo: { customerId: string; amount: number; currency: string; invoiceId: string } | null = null;
  let chargeSucceeded = false;
  let chargeFailed = false;
  let failureReason: string | undefined;

  const result = await withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const invoice = await invoiceQueries.findInvoiceById(s, tenantId, invoiceId);
    if (!invoice) {
      return { success: false, invoiceId: '', chargeId: null, status: 'failed', failureReason: 'Invoice not found' };
    }

    if (invoice.status !== 'open') {
      if (invoice.status === 'paid') {
        return { success: true, invoiceId: invoice.id, chargeId: null, status: 'paid' };
      }
      return { success: false, invoiceId: invoice.id, chargeId: null, status: 'failed', failureReason: `Cannot retry invoice in status: ${invoice.status}` };
    }

    const existingSucceeded = await invoiceQueries.findSucceededChargeForInvoice(s, invoice.id);
    if (existingSucceeded) {
      return { success: true, invoiceId: invoice.id, chargeId: existingSucceeded.id, status: 'paid' };
    }

    if (invoice.amountDue <= 0) {
      await invoiceQueries.updateInvoiceStatus(s, invoice.id, 'paid');
      await decrementCreditForInvoice(s, invoice.subscriptionId, invoice.total, invoice.amountDue);
      await transitionState(s, tenantId, invoice.subscriptionId, 'PAYMENT_SUCCESS', { actorType: 'system', actorId: 'retry-charge' });
      return { success: true, invoiceId: invoice.id, chargeId: null, status: 'paid' };
    }

    const pendingCharge = await invoiceQueries.findPendingChargeForInvoice(s, invoice.id);
    if (pendingCharge) {
      return { success: false, invoiceId: invoice.id, chargeId: pendingCharge.id, status: 'failed', failureReason: 'Charge already in progress' };
    }

    const subscription = await subscriptionQueries.findSubscriptionForUpdate(s, tenantId, invoice.subscriptionId);
    if (!subscription) {
      return { success: false, invoiceId: invoice.id, chargeId: null, status: 'failed', failureReason: 'Subscription not found' };
    }

    let pm = subscription.paymentMethodId
      ? await paymentMethodQueries.findPaymentMethodById(s, tenantId, subscription.paymentMethodId)
      : null;

    let usedBackupCard = false;
    if (!pm) {
      pm = await paymentMethodQueries.findBackupPaymentMethod(s, tenantId, subscription.customerId);
      usedBackupCard = true;
    }

    if (!pm) {
      return { success: false, invoiceId: invoice.id, chargeId: null, status: 'failed', failureReason: 'No payment method available' };
    }

    const charge = await invoiceQueries.insertCharge(s, tenantId, {
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      paymentMethodId: pm.id,
      currency: invoice.currency,
      amount: invoice.amountDue,
    });

    try {
      const tenant = await tenantQueries.findTenantById(s, tenantId);
      if (!tenant) {
        return { success: false, invoiceId: invoice.id, chargeId: charge.id, status: 'failed', failureReason: 'Tenant not found' };
      }

      const result = await getPaymentProcessor(tenant).charge({
        token: pm.nombaToken,
        amount: invoice.amountDue,
        currency: invoice.currency,
        transactionReference: charge.id,
        callbackUrl: config.NOMBA_CALLBACK_URL,
      });

      await invoiceQueries.updateChargeStatus(s, charge.id, 'succeeded', {
        nombaChargeId: result.chargeId,
        nombaReference: result.transactionId,
      });

      await invoiceQueries.updateInvoiceStatus(s, invoice.id, 'paid');
      await decrementCreditForInvoice(s, subscription.id, invoice.total, invoice.amountDue);

      await transitionState(s, tenantId, subscription.id, 'PAYMENT_SUCCESS', { actorType: 'system', actorId: 'retry-charge' });

      emailInfo = { customerId: invoice.customerId, amount: invoice.amountDue, currency: invoice.currency, invoiceId: invoice.id };
      chargeSucceeded = true;

      return { success: true, invoiceId: invoice.id, chargeId: charge.id, status: 'paid', usedBackupCard };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await invoiceQueries.updateChargeStatus(s, charge.id, 'failed', {
        failureMessage: message,
      });

      return { success: false, invoiceId: invoice.id, chargeId: charge.id, status: 'dunning', failureReason: message };
    }
  });

  if (emailInfo) {
    if (chargeSucceeded) {
      await sendReceiptEmail(sql, tenantId, emailInfo.customerId, emailInfo.amount, emailInfo.currency, `Retry payment for invoice ${emailInfo.invoiceId}`);
    } else if (chargeFailed) {
      await sendFailedEmail(sql, tenantId, emailInfo.customerId, emailInfo.amount, emailInfo.currency, failureReason ?? 'Payment failed');
    }
  }

  return result;
}
