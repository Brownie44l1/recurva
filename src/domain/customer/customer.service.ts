import type { Sql } from 'postgres';
import type { Customer, CreateCustomerInput, UpdateCustomerInput } from './customer.types';
import * as queries from '../../db/queries/customer.queries';
import { ConflictError, NotFoundError, ValidationError } from '../../errors';

export async function createCustomer(sql: Sql, tenantId: string, input: CreateCustomerInput): Promise<Customer> {
  if (input.externalId) {
    const existing = await queries.findCustomerByExternalId(sql, tenantId, input.externalId);
    if (existing) throw new ConflictError('A customer with this external ID already exists');
  }

  const existing = await queries.findCustomerByEmail(sql, tenantId, input.email);
  if (existing) throw new ConflictError('A customer with this email already exists');

  return queries.insertCustomer(sql, tenantId, {
    externalId: input.externalId ?? null,
    email: input.email,
    name: input.name ?? null,
    currency: input.currency ?? 'NGN',
    metadata: input.metadata ?? {},
  });
}

export async function getCustomer(sql: Sql, tenantId: string, customerId: string): Promise<Customer> {
  const customer = await queries.findCustomerById(sql, tenantId, customerId);
  if (!customer) throw new NotFoundError('Customer', customerId);
  return customer;
}

export async function getCustomerByEmail(sql: Sql, tenantId: string, email: string): Promise<Customer | null> {
  return queries.findCustomerByEmail(sql, tenantId, email);
}

export async function listCustomers(sql: Sql, tenantId: string, limit?: number, offset?: number): Promise<Customer[]> {
  return queries.listCustomers(sql, tenantId, limit ?? 20, offset ?? 0);
}

export async function updateCustomer(sql: Sql, tenantId: string, customerId: string, input: UpdateCustomerInput): Promise<Customer> {
  await getCustomer(sql, tenantId, customerId);
  return queries.updateCustomer(sql, tenantId, customerId, {
    name: input.name,
    email: input.email,
    metadata: input.metadata,
  });
}

export async function deleteCustomer(sql: Sql, tenantId: string, customerId: string): Promise<void> {
  await getCustomer(sql, tenantId, customerId);
  await queries.deleteCustomer(sql, tenantId, customerId);
}
