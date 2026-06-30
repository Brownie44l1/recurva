import type { Sql } from 'postgres';
import type { WebhookDelivery } from '../../domain/webhook/webhook.types';

export async function insertDelivery(sql: Sql, input: {
  webhookEndpointId: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<WebhookDelivery> {
  const [row] = await sql<WebhookDelivery[]>`
    INSERT INTO webhook_deliveries (webhook_endpoint_id, tenant_id, event_type, payload)
    VALUES (${input.webhookEndpointId}, ${input.tenantId}, ${input.eventType}, ${sql.json(input.payload as any)})
    RETURNING *
  `;
  return row!;
}

export async function findPendingDeliveries(sql: Sql, asOf: Date, limit: number = 50): Promise<WebhookDelivery[]> {
  return sql<WebhookDelivery[]>`
    SELECT * FROM webhook_deliveries
    WHERE status IN ('pending', 'failed')
      AND (next_retry_at IS NULL OR next_retry_at <= ${asOf})
    ORDER BY created_at ASC
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  `;
}

export async function updateDelivery(sql: Sql, deliveryId: string, updates: {
  status: string;
  attemptCount?: number;
  nextRetryAt?: Date | null;
  lastResponseCode?: number | null;
  lastResponseBody?: string | null;
}): Promise<WebhookDelivery> {
  const [row] = await sql<WebhookDelivery[]>`
    UPDATE webhook_deliveries SET
      status = ${updates.status},
      attempt_count = COALESCE(${updates.attemptCount ?? null}, attempt_count),
      next_retry_at = ${updates.nextRetryAt ?? null},
      last_response_code = COALESCE(${updates.lastResponseCode ?? null}, last_response_code),
      last_response_body = COALESCE(${updates.lastResponseBody ?? null}, last_response_body),
      updated_at = NOW()
    WHERE id = ${deliveryId}
    RETURNING *
  `;
  return row!;
}

export async function findDeliveriesByEndpoint(sql: Sql, tenantId: string, endpointId: string, limit: number = 100): Promise<WebhookDelivery[]> {
  return sql<WebhookDelivery[]>`
    SELECT * FROM webhook_deliveries
    WHERE tenant_id = ${tenantId} AND webhook_endpoint_id = ${endpointId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}
