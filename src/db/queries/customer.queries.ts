import type { Sql } from 'postgres';
import type { Customer } from '../../domain/customer/customer.types';

export async function insertCustomer(sql: Sql, tenantId: string, input: {
  externalId?: string | null;
  email: string;
  name?: string | null;
  currency?: string;
  metadata?: Record<string, unknown>;
}): Promise<Customer> {
  const [row] = await sql<Customer[]>`
    INSERT INTO customers (tenant_id, external_id, email, name, currency, metadata)
    VALUES (${tenantId}, ${input.externalId ?? null}, ${input.email}, ${input.name ?? null}, ${input.currency ?? 'NGN'}, ${sql.json(input.metadata ?? {} as any)})
    RETURNING *
  `;
  return row!;
}

export async function findCustomerById(sql: Sql, tenantId: string, customerId: string): Promise<Customer | null> {
  const [row] = await sql<Customer[]>`
    SELECT * FROM customers WHERE id = ${customerId} AND tenant_id = ${tenantId} LIMIT 1
  `;
  return row ?? null;
}

export async function findCustomerByEmail(sql: Sql, tenantId: string, email: string): Promise<Customer | null> {
  const [row] = await sql<Customer[]>`
    SELECT * FROM customers WHERE tenant_id = ${tenantId} AND email = ${email} LIMIT 1
  `;
  return row ?? null;
}

export async function findCustomerByExternalId(sql: Sql, tenantId: string, externalId: string): Promise<Customer | null> {
  const [row] = await sql<Customer[]>`
    SELECT * FROM customers WHERE tenant_id = ${tenantId} AND external_id = ${externalId} LIMIT 1
  `;
  return row ?? null;
}

export async function listCustomers(sql: Sql, tenantId: string, limit: number = 20, offset: number = 0): Promise<Customer[]> {
  return sql<Customer[]>`
    SELECT * FROM customers WHERE tenant_id = ${tenantId}
    ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function updateCustomer(sql: Sql, tenantId: string, customerId: string, input: {
  name?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}): Promise<Customer> {
  const [row] = await sql<Customer[]>`
    UPDATE customers SET
      name = COALESCE(${input.name ?? null}, name),
      email = COALESCE(${input.email ?? null}, email),
      metadata = CASE WHEN ${sql.json(input.metadata ?? null as any)}::jsonb IS NOT NULL
        THEN customers.metadata || ${sql.json(input.metadata ?? {} as any)}::jsonb
        ELSE metadata
      END,
      updated_at = NOW()
    WHERE id = ${customerId} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return row!;
}

export async function deleteCustomer(sql: Sql, tenantId: string, customerId: string): Promise<void> {
  await sql`DELETE FROM customers WHERE id = ${customerId} AND tenant_id = ${tenantId}`;
}
