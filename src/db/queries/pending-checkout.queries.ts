import type { Sql } from 'postgres';

export interface PendingCheckout {
  id: string;
  tenantId: string;
  subscriptionId: string;
  customerId: string;
  orderReference: string;
  amount: number;
  currency: string;
  consumed: boolean;
  createdAt: Date;
}

export async function insertPendingCheckout(sql: Sql, input: {
  tenantId: string;
  subscriptionId: string;
  customerId: string;
  orderReference: string;
  amount: number;
  currency: string;
}): Promise<PendingCheckout> {
  const [row] = await sql<PendingCheckout[]>`
    INSERT INTO pending_checkouts (tenant_id, subscription_id, customer_id, order_reference, amount, currency)
    VALUES (${input.tenantId}, ${input.subscriptionId}, ${input.customerId}, ${input.orderReference}, ${input.amount}, ${input.currency})
    RETURNING *
  `;
  return row!;
}

export async function findPendingCheckoutByReference(sql: Sql, orderReference: string): Promise<PendingCheckout | null> {
  const [row] = await sql<PendingCheckout[]>`
    SELECT * FROM pending_checkouts WHERE order_reference = ${orderReference} LIMIT 1
  `;
  return row ?? null;
}

export async function markPendingCheckoutConsumed(sql: Sql, id: string): Promise<void> {
  await sql`UPDATE pending_checkouts SET consumed = TRUE WHERE id = ${id}`;
}
