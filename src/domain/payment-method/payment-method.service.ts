import type { Sql } from 'postgres';
import type { PaymentMethod, AttachPaymentMethodInput } from './payment-method.types';
import * as queries from '../../db/queries/payment-method.queries';
import { NotFoundError, ValidationError } from '../../errors';

const MAX_PAYMENT_METHODS = 5;

export async function attachPaymentMethod(
  sql: Sql,
  tenantId: string,
  customerId: string,
  input: AttachPaymentMethodInput,
): Promise<PaymentMethod> {
  const count = await queries.countPaymentMethods(sql, customerId);
  if (count >= MAX_PAYMENT_METHODS) {
    throw new ValidationError(`Maximum of ${MAX_PAYMENT_METHODS} payment methods per customer`);
  }

  const method = await queries.insertPaymentMethod(sql, tenantId, customerId, {
    nombaToken: input.nombaToken,
    cardLast4: input.cardLast4,
    cardBrand: input.cardBrand,
    cardExpMonth: input.cardExpMonth,
    cardExpYear: input.cardExpYear,
  });

  if (count === 0) {
    await queries.promoteToPrimary(sql, customerId, method.id);
  }

  return method;
}

export async function listPaymentMethods(sql: Sql, tenantId: string, customerId: string): Promise<PaymentMethod[]> {
  return queries.findPaymentMethodsByCustomer(sql, tenantId, customerId);
}

export async function getDefaultPaymentMethod(sql: Sql, tenantId: string, customerId: string): Promise<PaymentMethod | null> {
  return queries.findPrimaryPaymentMethod(sql, tenantId, customerId);
}

export async function setDefaultPaymentMethod(sql: Sql, tenantId: string, customerId: string, methodId: string): Promise<void> {
  const method = await queries.findPaymentMethodById(sql, tenantId, methodId);
  if (!method) throw new NotFoundError('PaymentMethod', methodId);
  await queries.promoteToPrimary(sql, customerId, methodId);
}

export async function deletePaymentMethod(sql: Sql, tenantId: string, methodId: string): Promise<void> {
  const method = await queries.findPaymentMethodById(sql, tenantId, methodId);
  if (!method) throw new NotFoundError('PaymentMethod', methodId);

  await queries.deletePaymentMethod(sql, methodId);
}

export async function getFallbackMethods(sql: Sql, tenantId: string, customerId: string, excludeMethodId: string): Promise<PaymentMethod[]> {
  const methods = await queries.findPaymentMethodsByCustomer(sql, tenantId, customerId);
  return methods.filter((m) => m.id !== excludeMethodId);
}
