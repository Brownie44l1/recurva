import { createMiddleware } from 'hono/factory';
import { getDb } from '../../db/client';
import { authenticateTenant } from '../../domain/tenant/tenant.service';
import { UnauthorizedError } from '../../errors';
import type { Tenant } from '../../domain/tenant/tenant.types';

declare module 'hono' {
  interface ContextVariableMap {
    tenant: Tenant;
  }
}

export const tenantAuthMiddleware = createMiddleware(async (c, next) => {
  const sql = getDb();
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing API key. Provide it as Authorization: Bearer rk_live_...');
  }

  const rawKey = authHeader.slice(7);
  const tenant = await authenticateTenant(sql, rawKey);

  c.set('tenant', tenant);
  await next();
});
