import type { Sql } from 'postgres';
import type { PaymentMethod } from '../../domain/payment-method/payment-method.types';
import { withTransaction } from '../transaction';

export async function insertPaymentMethod(sql: Sql, tenantId: string, customerId: string, input: {
  nombaToken: string;
  cardLast4: string;
  cardBrand: string;
  cardExpMonth: number;
  cardExpYear: number;
}): Promise<PaymentMethod> {
  const [row] = await sql<PaymentMethod[]>`
    INSERT INTO payment_methods (tenant_id, customer_id, nomba_token, card_last4, card_brand, card_exp_month, card_exp_year)
    VALUES (${tenantId}, ${customerId}, ${input.nombaToken}, ${input.cardLast4}, ${input.cardBrand}, ${input.cardExpMonth}, ${input.cardExpYear})
    RETURNING *
  `;
  return row!;
}

export async function findPaymentMethodsByCustomer(sql: Sql, tenantId: string, customerId: string): Promise<PaymentMethod[]> {
  return sql<PaymentMethod[]>`
    SELECT * FROM payment_methods
    WHERE tenant_id = ${tenantId} AND customer_id = ${customerId}
    ORDER BY is_primary DESC, is_backup DESC, created_at ASC
  `;
}

export async function findPaymentMethodById(sql: Sql, tenantId: string, methodId: string): Promise<PaymentMethod | null> {
  const [row] = await sql<PaymentMethod[]>`
    SELECT * FROM payment_methods WHERE id = ${methodId} AND tenant_id = ${tenantId} LIMIT 1
  `;
  return row ?? null;
}

export async function findPrimaryPaymentMethod(sql: Sql, tenantId: string, customerId: string): Promise<PaymentMethod | null> {
  const [row] = await sql<PaymentMethod[]>`
    SELECT * FROM payment_methods
    WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} AND is_primary = TRUE
    LIMIT 1
  `;
  return row ?? null;
}

export async function findBackupPaymentMethod(sql: Sql, tenantId: string, customerId: string): Promise<PaymentMethod | null> {
  const [row] = await sql<PaymentMethod[]>`
    SELECT * FROM payment_methods
    WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} AND is_backup = TRUE
    LIMIT 1
  `;
  return row ?? null;
}

export async function promoteToPrimary(sql: Sql, customerId: string, methodId: string): Promise<void> {
  await withTransaction(sql, async (tx) => {
    await tx`UPDATE payment_methods SET is_primary = FALSE WHERE customer_id = ${customerId}`;
    await tx`UPDATE payment_methods SET is_primary = TRUE WHERE id = ${methodId}`;
  });
}

export async function setBackup(sql: Sql, customerId: string, methodId: string): Promise<void> {
  await withTransaction(sql, async (tx) => {
    await tx`UPDATE payment_methods SET is_backup = FALSE WHERE customer_id = ${customerId}`;
    await tx`UPDATE payment_methods SET is_backup = TRUE WHERE id = ${methodId}`;
  });
}

export async function deletePaymentMethod(sql: Sql, methodId: string): Promise<void> {
  await sql`DELETE FROM payment_methods WHERE id = ${methodId}`;
}

export async function countPaymentMethods(sql: Sql, customerId: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM payment_methods WHERE customer_id = ${customerId}
  `;
  return row!.count;
}
