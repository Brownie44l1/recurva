import type { Sql } from 'postgres';
import type { Tenant, TenantApiKey } from '../../domain/tenant/tenant.types';

export async function insertTenant(sql: Sql, input: { name: string; email: string; mode?: 'test' | 'live' }): Promise<Tenant> {
  const [row] = await sql<Tenant[]>`
    INSERT INTO tenants (name, email, mode)
    VALUES (${input.name}, ${input.email}, ${input.mode ?? 'test'})
    RETURNING *
  `;
  return row!;
}

export async function findTenantById(sql: Sql, tenantId: string): Promise<Tenant | null> {
  const [row] = await sql<Tenant[]>`
    SELECT * FROM tenants WHERE id = ${tenantId} AND is_active = TRUE LIMIT 1
  `;
  return row ?? null;
}

export async function findTenantByEmail(sql: Sql, email: string): Promise<Tenant | null> {
  const [row] = await sql<Tenant[]>`
    SELECT * FROM tenants WHERE email = ${email} LIMIT 1
  `;
  return row ?? null;
}

export async function insertApiKey(sql: Sql, input: {
  tenantId: string;
  keyPrefix: string;
  keyHash: string;
  label?: string | null;
  expiresAt?: Date | null;
}): Promise<TenantApiKey> {
  const [row] = await sql<TenantApiKey[]>`
    INSERT INTO tenant_api_keys (tenant_id, key_prefix, key_hash, label, expires_at)
    VALUES (${input.tenantId}, ${input.keyPrefix}, ${input.keyHash}, ${input.label ?? null}, ${input.expiresAt ?? null})
    RETURNING *
  `;
  return row!;
}

export async function findApiKeyByHash(sql: Sql, keyHash: string): Promise<{ key: TenantApiKey; tenant: Tenant } | null> {
  const [row] = await sql<{ key: TenantApiKey; tenant: Tenant }[]>`
    SELECT
      row_to_json(k.*)::jsonb AS key,
      row_to_json(t.*)::jsonb AS tenant
    FROM tenant_api_keys k
    JOIN tenants t ON t.id = k.tenant_id
    WHERE k.key_hash = ${keyHash}
      AND k.is_active = TRUE
      AND (k.expires_at IS NULL OR k.expires_at > NOW())
      AND t.is_active = TRUE
    LIMIT 1
  `;
  return row ?? null;
}

export async function updateApiKeyLastUsed(sql: Sql, keyId: string): Promise<void> {
  await sql`
    UPDATE tenant_api_keys SET last_used_at = NOW() WHERE id = ${keyId}
  `;
}
