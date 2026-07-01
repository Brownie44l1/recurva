import type { Sql } from 'postgres';
import type { WebhookEndpoint, RegisterEndpointInput } from './webhook.types';
import * as endpointQueries from '../../db/queries/webhook-endpoint.queries';
import * as deliveryQueries from '../../db/queries/webhook-delivery.queries';
import { NotFoundError } from '../../errors';
import * as crypto from 'crypto';

function generateSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

export async function registerEndpoint(sql: Sql, tenantId: string, input: RegisterEndpointInput): Promise<WebhookEndpoint> {
  return endpointQueries.insertEndpoint(sql, tenantId, {
    url: input.url,
    eventTypes: input.eventTypes ?? [],
    signingSecret: input.signingSecret ?? generateSecret(),
  });
}

export async function listEndpoints(sql: Sql, tenantId: string): Promise<WebhookEndpoint[]> {
  return endpointQueries.findEndpointsByTenant(sql, tenantId);
}

export async function updateEndpoint(sql: Sql, tenantId: string, endpointId: string, input: {
  url?: string;
  eventTypes?: string[];
  isActive?: boolean;
}): Promise<WebhookEndpoint> {
  const endpoint = await endpointQueries.updateEndpoint(sql, tenantId, endpointId, input);
  if (!endpoint) throw new NotFoundError('WebhookEndpoint', endpointId);
  return endpoint;
}

export async function deleteEndpoint(sql: Sql, tenantId: string, endpointId: string): Promise<void> {
  const endpoint = await endpointQueries.findEndpointById(sql, tenantId, endpointId);
  if (!endpoint) throw new NotFoundError('WebhookEndpoint', endpointId);
  await endpointQueries.deleteEndpoint(sql, tenantId, endpointId);
}

export async function enqueueEvent(
  sql: Sql,
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const endpoints = await endpointQueries.findEndpointsByTenant(sql, tenantId);

  for (const endpoint of endpoints) {
    if (endpoint.eventTypes.length > 0 && !endpoint.eventTypes.includes(eventType)) {
      continue;
    }

    await deliveryQueries.insertDelivery(sql, {
      webhookEndpointId: endpoint.id,
      tenantId,
      eventType,
      payload,
    });
  }
}

export function signPayload(secret: string, payload: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

export async function getEndpoint(sql: Sql, tenantId: string, endpointId: string): Promise<WebhookEndpoint> {
  const endpoint = await endpointQueries.findEndpointById(sql, tenantId, endpointId);
  if (!endpoint) throw new NotFoundError('WebhookEndpoint', endpointId);
  return endpoint;
}

export async function getDeliveries(sql: Sql, tenantId: string, endpointId: string, limit?: number): Promise<unknown[]> {
  return deliveryQueries.findDeliveriesByEndpoint(sql, tenantId, endpointId, limit ?? 100);
}
