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
import { getFxRate, convertAmount } from '../fx/fx.service';

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

interface EmailTxInfo {
  customerId: string;
  amount: number;
  currency: string;
  invoiceId: string;
}

export async function billSubscription(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  context: BillingContext,
): Promise<BillingResult> {
  const { result, email } = await withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const subscription = await subscriptionQueries.findSubscriptionForUpdate(s, tenantId, subscriptionId);
    if (!subscription) {
      return { result: { success: false, invoiceId: '', chargeId: null, status: 'failed' as const, failureReason: 'Subscription not found' }, email: null };
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

      return { result: { success: true, invoiceId: invoice.id, chargeId: null, status: 'paid' as const }, email: null };
    }

    const pm = subscription.paymentMethodId
      ? await paymentMethodQueries.findPaymentMethodById(s, tenantId, subscription.paymentMethodId)
      : null;

    if (!pm) {
      const emailInfo: EmailTxInfo = { customerId: subscription.customerId, amount: 0, currency: subscription.currency, invoiceId: invoice.id };
      const { subscription: sub, sideEffects } = await transitionState(s, tenantId, subscriptionId, 'PAYMENT_FAILED', context);
      await executeSideEffects(s, tenantId, sub, sideEffects, context, { invoiceId: invoice.id });
      return { result: { success: false, invoiceId: invoice.id, chargeId: null, status: 'dunning' as const }, email: { ...emailInfo, chargeSucceeded: false, chargeFailed: true, failureReason: 'No payment method' as const } };
    }

    const pendingCharge = await invoiceQueries.findPendingChargeForInvoice(s, invoice.id);
    if (pendingCharge) {
      return { result: { success: false, invoiceId: invoice.id, chargeId: pendingCharge.id, status: 'failed' as const, failureReason: 'Charge already in progress' }, email: null };
    }

    const tenant = await tenantQueries.findTenantById(s, tenantId);
    if (!tenant) {
      return { result: { success: false, invoiceId: invoice.id, chargeId: null, status: 'failed' as const, failureReason: 'Tenant not found' }, email: null };
    }

    const processor = getPaymentProcessor(tenant);
    const invoiceCurrency = subscription.currency;

    let chargeCurrency = invoiceCurrency;
    let chargeAmount = finalized.amountDue;
    let fxRate: number | null = null;
    let settlementCurrency: string | null = null;
    let settlementAmount: number | null = null;

    if (!processor.supportsCurrency(invoiceCurrency)) {
      const defaultSettlement = 'NGN';
      const { rate, source } = await getFxRate(invoiceCurrency, defaultSettlement);
      fxRate = rate;
      settlementCurrency = defaultSettlement;
      chargeAmount = convertAmount(finalized.amountDue, rate);
      settlementAmount = chargeAmount;
      chargeCurrency = defaultSettlement;
      logger.info({ invoiceCurrency, settlementCurrency: defaultSettlement, rate, source }, 'Cross-currency FX conversion applied');
    }

    const charge = await invoiceQueries.insertCharge(s, tenantId, {
      customerId: subscription.customerId,
      invoiceId: invoice.id,
      paymentMethodId: pm.id,
      currency: chargeCurrency,
      amount: chargeAmount,
      fxRate,
      settlementCurrency,
      settlementAmount,
    });

    if (fxRate !== null) {
      await invoiceQueries.updateInvoiceFx(s, charge.invoiceId, fxRate, settlementCurrency, settlementAmount);
    }

    try {
      const chargeResult = await processor.charge({
        token: pm.nombaToken,
        amount: chargeAmount,
        currency: chargeCurrency,
        transactionReference: charge.id,
        callbackUrl: config.NOMBA_CALLBACK_URL,
      });

      await invoiceQueries.updateChargeStatus(s, charge.id, 'succeeded', {
        nombaChargeId: chargeResult.chargeId,
        nombaReference: chargeResult.transactionId,
      });

      await invoiceQueries.updateInvoiceStatus(s, invoice.id, 'paid');
      await decrementCreditForInvoice(s, subscription.id, finalized.total, finalized.amountDue);

      const nextPeriodStart = new Date(subscription.currentPeriodEnd);
      const nextPeriodEnd = new Date(nextPeriodStart.getTime() + (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()));

      await subscriptionQueries.updateSubscriptionPeriod(s, tenantId, subscriptionId, nextPeriodStart, nextPeriodEnd);

      return { result: { success: true, invoiceId: invoice.id, chargeId: charge.id, status: 'paid' as const }, email: { customerId: subscription.customerId, amount: finalized.amountDue, currency: subscription.currency, invoiceId: invoice.id, chargeSucceeded: true, chargeFailed: false, failureReason: undefined } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await invoiceQueries.updateChargeStatus(s, charge.id, 'failed', {
        failureMessage: message,
      });

      await transitionState(s, tenantId, subscriptionId, 'PAYMENT_FAILED', context);

      return { result: { success: false, invoiceId: invoice.id, chargeId: charge.id, status: 'dunning' as const, failureReason: message }, email: { customerId: subscription.customerId, amount: finalized.amountDue, currency: subscription.currency, invoiceId: invoice.id, chargeSucceeded: false, chargeFailed: true, failureReason: message } };
    }
  });

  if (email) {
    if (email.chargeSucceeded) {
      await sendReceiptEmail(sql, tenantId, email.customerId, email.amount, email.currency, `Subscription payment for invoice ${email.invoiceId}`);
    } else if (email.chargeFailed) {
      await sendFailedEmail(sql, tenantId, email.customerId, email.amount, email.currency, email.failureReason ?? 'Payment failed');
    }
  }

  return result;
}

export async function retryCharge(
  sql: Sql,
  tenantId: string,
  invoiceId: string,
): Promise<BillingResult> {
  const { result, email } = await withTransaction(sql, async (tx) => {
    const s = asSql(tx);
    const invoice = await invoiceQueries.findInvoiceById(s, tenantId, invoiceId);
    if (!invoice) {
      return { result: { success: false, invoiceId: '', chargeId: null, status: 'failed' as const, failureReason: 'Invoice not found' }, email: null };
    }

    if (invoice.status !== 'open') {
      if (invoice.status === 'paid') {
        return { result: { success: true, invoiceId: invoice.id, chargeId: null, status: 'paid' as const }, email: null };
      }
      return { result: { success: false, invoiceId: invoice.id, chargeId: null, status: 'failed' as const, failureReason: `Cannot retry invoice in status: ${invoice.status}` }, email: null };
    }

    const existingSucceeded = await invoiceQueries.findSucceededChargeForInvoice(s, invoice.id);
    if (existingSucceeded) {
      return { result: { success: true, invoiceId: invoice.id, chargeId: existingSucceeded.id, status: 'paid' as const }, email: null };
    }

    if (invoice.amountDue <= 0) {
      await invoiceQueries.updateInvoiceStatus(s, invoice.id, 'paid');
      await decrementCreditForInvoice(s, invoice.subscriptionId, invoice.total, invoice.amountDue);
      await transitionState(s, tenantId, invoice.subscriptionId, 'PAYMENT_SUCCESS', { actorType: 'system', actorId: 'retry-charge' });
      return { result: { success: true, invoiceId: invoice.id, chargeId: null, status: 'paid' as const }, email: null };
    }

    const pendingCharge = await invoiceQueries.findPendingChargeForInvoice(s, invoice.id);
    if (pendingCharge) {
      return { result: { success: false, invoiceId: invoice.id, chargeId: pendingCharge.id, status: 'failed' as const, failureReason: 'Charge already in progress' }, email: null };
    }

    const subscription = await subscriptionQueries.findSubscriptionForUpdate(s, tenantId, invoice.subscriptionId);
    if (!subscription) {
      return { result: { success: false, invoiceId: invoice.id, chargeId: null, status: 'failed' as const, failureReason: 'Subscription not found' }, email: null };
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
      return { result: { success: false, invoiceId: invoice.id, chargeId: null, status: 'failed' as const, failureReason: 'No payment method available' }, email: null };
    }

    const tenant = await tenantQueries.findTenantById(s, tenantId);
    if (!tenant) {
      return { result: { success: false, invoiceId: invoice.id, chargeId: null, status: 'failed' as const, failureReason: 'Tenant not found' }, email: null };
    }

    const processor = getPaymentProcessor(tenant);
    const invoiceCurrency = invoice.currency;

    let chargeCurrency = invoiceCurrency;
    let chargeAmount = invoice.amountDue;
    let fxRate: number | null = null;
    let settlementCurrency: string | null = null;
    let settlementAmount: number | null = null;

    if (!processor.supportsCurrency(invoiceCurrency)) {
      const defaultSettlement = 'NGN';
      const { rate, source } = await getFxRate(invoiceCurrency, defaultSettlement);
      fxRate = rate;
      settlementCurrency = defaultSettlement;
      chargeAmount = convertAmount(invoice.amountDue, rate);
      settlementAmount = chargeAmount;
      chargeCurrency = defaultSettlement;
      logger.info({ invoiceCurrency, settlementCurrency: defaultSettlement, rate, source }, 'Cross-currency FX conversion applied');
    }

    const charge = await invoiceQueries.insertCharge(s, tenantId, {
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      paymentMethodId: pm.id,
      currency: chargeCurrency,
      amount: chargeAmount,
      fxRate,
      settlementCurrency,
      settlementAmount,
    });

    if (fxRate !== null) {
      await invoiceQueries.updateInvoiceFx(s, charge.invoiceId, fxRate, settlementCurrency, settlementAmount);
    }

    try {
      const chargeResult = await processor.charge({
        token: pm.nombaToken,
        amount: chargeAmount,
        currency: chargeCurrency,
        transactionReference: charge.id,
        callbackUrl: config.NOMBA_CALLBACK_URL,
      });

      await invoiceQueries.updateChargeStatus(s, charge.id, 'succeeded', {
        nombaChargeId: chargeResult.chargeId,
        nombaReference: chargeResult.transactionId,
      });

      await invoiceQueries.updateInvoiceStatus(s, invoice.id, 'paid');
      await decrementCreditForInvoice(s, subscription.id, invoice.total, invoice.amountDue);

      await transitionState(s, tenantId, subscription.id, 'PAYMENT_SUCCESS', { actorType: 'system', actorId: 'retry-charge' });

      return { result: { success: true, invoiceId: invoice.id, chargeId: charge.id, status: 'paid' as const, usedBackupCard }, email: { customerId: invoice.customerId, amount: invoice.amountDue, currency: invoice.currency, invoiceId: invoice.id, chargeSucceeded: true, chargeFailed: false, failureReason: undefined } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await invoiceQueries.updateChargeStatus(s, charge.id, 'failed', {
        failureMessage: message,
      });

      return { result: { success: false, invoiceId: invoice.id, chargeId: charge.id, status: 'dunning' as const, failureReason: message }, email: null };
    }
  });

  if (email) {
    if (email.chargeSucceeded) {
      await sendReceiptEmail(sql, tenantId, email.customerId, email.amount, email.currency, `Retry payment for invoice ${email.invoiceId}`);
    } else if (email.chargeFailed) {
      await sendFailedEmail(sql, tenantId, email.customerId, email.amount, email.currency, email.failureReason ?? 'Payment failed');
    }
  }

  return result;
}
