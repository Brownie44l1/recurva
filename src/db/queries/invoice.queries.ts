import type { Sql } from 'postgres';
import type { Invoice, InvoiceLineItem, Charge, InvoiceStatus } from '../../domain/invoice/invoice.types';

export async function insertInvoice(sql: Sql, tenantId: string, input: {
  customerId: string;
  subscriptionId: string;
  currency: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  amountDue: number;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  idempotencyKey: string;
}): Promise<Invoice> {
  const [row] = await sql<Invoice[]>`
    INSERT INTO invoices (
      tenant_id, customer_id, subscription_id, currency,
      subtotal, discount_amount, total, amount_due,
      period_start, period_end, due_date, idempotency_key
    ) VALUES (
      ${tenantId}, ${input.customerId}, ${input.subscriptionId}, ${input.currency},
      ${input.subtotal}, ${input.discountAmount}, ${input.total}, ${input.amountDue},
      ${input.periodStart}, ${input.periodEnd}, ${input.dueDate}, ${input.idempotencyKey}
    )
    RETURNING *
  `;
  return { ...row!, lineItems: [] };
}

export async function insertLineItem(sql: Sql, invoiceId: string, input: {
  type: string;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}): Promise<InvoiceLineItem> {
  const [row] = await sql<InvoiceLineItem[]>`
    INSERT INTO invoice_line_items (invoice_id, type, description, quantity, unit_amount, amount, period_start, period_end)
    VALUES (${invoiceId}, ${input.type}, ${input.description}, ${input.quantity}, ${input.unitAmount}, ${input.amount}, ${input.periodStart ?? null}, ${input.periodEnd ?? null})
    RETURNING *
  `;
  return row!;
}

export async function findInvoiceById(sql: Sql, tenantId: string, invoiceId: string): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | null> {
  const [row] = await sql<Invoice[]>`
    SELECT * FROM invoices WHERE id = ${invoiceId} AND tenant_id = ${tenantId} LIMIT 1
  `;
  if (!row) return null;

  const lineItems = await sql<InvoiceLineItem[]>`
    SELECT * FROM invoice_line_items WHERE invoice_id = ${invoiceId} ORDER BY created_at ASC
  `;

  return { ...row, lineItems };
}

export async function findInvoiceByIdempotencyKey(sql: Sql, idempotencyKey: string): Promise<Invoice | null> {
  const [row] = await sql<Invoice[]>`
    SELECT * FROM invoices WHERE idempotency_key = ${idempotencyKey} LIMIT 1
  `;
  return row ?? null;
}

export async function listInvoicesBySubscription(sql: Sql, tenantId: string, subscriptionId: string): Promise<Invoice[]> {
  return sql<Invoice[]>`
    SELECT * FROM invoices
    WHERE tenant_id = ${tenantId} AND subscription_id = ${subscriptionId}
    ORDER BY created_at DESC
  `;
}

export async function listInvoicesByCustomer(sql: Sql, tenantId: string, customerId: string, limit: number = 20, offset: number = 0): Promise<Invoice[]> {
  return sql<Invoice[]>`
    SELECT * FROM invoices
    WHERE tenant_id = ${tenantId} AND customer_id = ${customerId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function updateInvoiceStatus(sql: Sql, invoiceId: string, status: InvoiceStatus): Promise<Invoice> {
  const updates: string[] = ['status = ${status}'];
  if (status === 'paid') updates.push('paid_at = NOW()');
  if (status === 'void') updates.push('voided_at = NOW()');

  const [row] = await sql<Invoice[]>`
    UPDATE invoices SET
      status = ${status},
      paid_at = CASE WHEN ${status} = 'paid' THEN NOW() ELSE paid_at END,
      voided_at = CASE WHEN ${status} = 'void' THEN NOW() ELSE voided_at END,
      updated_at = NOW()
    WHERE id = ${invoiceId}
    RETURNING *
  `;
  return row!;
}

export async function insertCharge(sql: Sql, tenantId: string, input: {
  customerId: string;
  invoiceId: string;
  paymentMethodId?: string | null;
  currency: string;
  amount: number;
}): Promise<Charge> {
  const [row] = await sql<Charge[]>`
    INSERT INTO charges (tenant_id, customer_id, invoice_id, payment_method_id, currency, amount)
    VALUES (${tenantId}, ${input.customerId}, ${input.invoiceId}, ${input.paymentMethodId ?? null}, ${input.currency}, ${input.amount})
    RETURNING *
  `;
  return row!;
}

export async function updateChargeStatus(sql: Sql, chargeId: string, status: string, updates?: {
  nombaChargeId?: string;
  nombaReference?: string;
  failureCode?: string;
  failureMessage?: string;
}): Promise<Charge> {
  const [row] = await sql<Charge[]>`
    UPDATE charges SET
      status = ${status},
      nomba_charge_id = COALESCE(${updates?.nombaChargeId ?? null}, nomba_charge_id),
      nomba_reference = COALESCE(${updates?.nombaReference ?? null}, nomba_reference),
      failure_code = COALESCE(${updates?.failureCode ?? null}, failure_code),
      failure_message = COALESCE(${updates?.failureMessage ?? null}, failure_message),
      updated_at = NOW()
    WHERE id = ${chargeId}
    RETURNING *
  `;
  return row!;
}

export async function findChargeByNombaReferenceWithLock(sql: Sql, nombaReference: string): Promise<Charge | null> {
  const [row] = await sql<Charge[]>`
    SELECT * FROM charges WHERE nomba_reference = ${nombaReference} LIMIT 1
    FOR UPDATE
  `;
  return row ?? null;
}

export async function updateChargeByNombaReference(sql: Sql, nombaReference: string, updates: {
  status?: string;
  amountRefunded?: number;
  failureMessage?: string;
}): Promise<Charge | null> {
  const [row] = await sql<Charge[]>`
    UPDATE charges SET
      status = COALESCE(${updates.status ?? null}, status),
      amount_refunded = COALESCE(${updates.amountRefunded ?? null}, amount_refunded),
      failure_message = COALESCE(${updates.failureMessage ?? null}, failure_message),
      updated_at = NOW()
    WHERE nomba_reference = ${nombaReference}
    RETURNING *
  `;
  return row ?? null;
}

export async function findOpenInvoiceForSubscription(sql: Sql, subscriptionId: string): Promise<Invoice | null> {
  const [row] = await sql<Invoice[]>`
    SELECT * FROM invoices
    WHERE subscription_id = ${subscriptionId} AND status = 'open'
    ORDER BY created_at DESC LIMIT 1
  `;
  return row ?? null;
}
