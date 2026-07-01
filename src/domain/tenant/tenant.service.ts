import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import type { Sql } from 'postgres';
import type { Tenant, CreateTenantInput } from './tenant.types';
import * as queries from '../../db/queries/tenant.queries';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../errors';

const KEY_PREFIX = 'rcv_live';
const BCRYPT_ROUNDS = 12;

function generateApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const randomBytes = crypto.randomBytes(32);
  const rawKey = `${KEY_PREFIX}_${randomBytes.toString('hex')}`;
  const keyPrefix = `${KEY_PREFIX}_${randomBytes.toString('hex').slice(0, 5)}`;
  const keyHash = bcrypt.hashSync(rawKey, BCRYPT_ROUNDS);
  return { rawKey, keyPrefix, keyHash };
}

export async function createTenant(sql: Sql, input: CreateTenantInput): Promise<{ tenant: Tenant; rawApiKey: string }> {
  const existing = await queries.findTenantByEmail(sql, input.email);
  if (existing) {
    throw new ConflictError('A tenant with this email already exists');
  }

  const tenant = await queries.insertTenant(sql, input);
  const { rawKey, keyPrefix, keyHash } = generateApiKey();

  await queries.insertApiKey(sql, {
    tenantId: tenant.id,
    keyPrefix,
    keyHash,
    label: 'Default API Key',
  });

  return { tenant, rawApiKey: rawKey };
}

export async function getTenantById(sql: Sql, tenantId: string): Promise<Tenant> {
  const tenant = await queries.findTenantById(sql, tenantId);
  if (!tenant) throw new NotFoundError('Tenant', tenantId);
  return tenant;
}

export async function authenticateTenant(sql: Sql, rawKey: string): Promise<Tenant> {
  const keys = await sql<{ keyHash: string; tenant: Tenant; keyId: string }[]>`
    SELECT k.key_hash AS "keyHash", k.id AS "keyId",
      row_to_json(t.*)::jsonb AS tenant
    FROM tenant_api_keys k
    JOIN tenants t ON t.id = k.tenant_id
    WHERE k.is_active = TRUE
      AND (k.expires_at IS NULL OR k.expires_at > NOW())
      AND t.is_active = TRUE
  `;

  for (const row of keys) {
    if (bcrypt.compareSync(rawKey, row.keyHash)) {
      await queries.updateApiKeyLastUsed(sql, row.keyId);
      return row.tenant;
    }
  }

  throw new UnauthorizedError('Invalid API key');
}

export async function generateNewApiKey(sql: Sql, tenantId: string, label?: string): Promise<{ rawKey: string; keyPrefix: string }> {
  const { rawKey, keyPrefix, keyHash } = generateApiKey();

  await queries.insertApiKey(sql, {
    tenantId,
    keyPrefix,
    keyHash,
    label,
  });

  return { rawKey, keyPrefix };
}
