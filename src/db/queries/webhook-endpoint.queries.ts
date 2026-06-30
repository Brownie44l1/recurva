import type { Sql } from 'postgres';
import type { WebhookEndpoint } from '../../domain/webhook/webhook.types';

export async function insertEndpoint(sql: Sql, tenantId: string, input: {
  url: string;
  eventTypes: string[];
  signingSecret: string;
}): Promise<WebhookEndpoint> {
  const [row] = await sql<WebhookEndpoint[]>`
    INSERT INTO webhook_endpoints (tenant_id, url, event_types, signing_secret)
    VALUES (${tenantId}, ${input.url}, ${sql.json(input.eventTypes as any)}, ${input.signingSecret})
    RETURNING *
  `;
  return row!;
}

export async function findEndpointsByTenant(sql: Sql, tenantId: string): Promise<WebhookEndpoint[]> {
  return sql<WebhookEndpoint[]>`
    SELECT * FROM webhook_endpoints WHERE tenant_id = ${tenantId} AND is_active = TRUE
  `;
}

export async function findEndpointById(sql: Sql, tenantId: string, endpointId: string): Promise<WebhookEndpoint | null> {
  const [row] = await sql<WebhookEndpoint[]>`
    SELECT * FROM webhook_endpoints WHERE id = ${endpointId} AND tenant_id = ${tenantId} LIMIT 1
  `;
  return row ?? null;
}
