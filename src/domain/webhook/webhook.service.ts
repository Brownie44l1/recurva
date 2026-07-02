import type { Sql } from 'postgres';
import type { WebhookEndpoint, RegisterEndpointInput } from './webhook.types';
import * as endpointQueries from '../../db/queries/webhook-endpoint.queries';
import * as deliveryQueries from '../../db/queries/webhook-delivery.queries';
import { NotFoundError, ValidationError } from '../../errors';
import * as crypto from 'crypto';
import * as dns from 'dns';

const dnsLookup = dns.promises.lookup;

const PRIVATE_RANGES = [
  { mask: 8, network: 10n << 24n },           // 10.0.0.0/8
  { mask: 12, network: (172n << 24n) | (16n << 16n) },  // 172.16.0.0/12
  { mask: 16, network: (192n << 24n) | (168n << 16n) }, // 192.168.0.0/16
  { mask: 16, network: (169n << 24n) | (254n << 16n) }, // 169.254.0.0/16 (link-local)
  { mask: 8, network: 127n << 24n },          // 127.0.0.0/8 (loopback)
  { mask: 8, network: 0n },                   // 0.0.0.0/8
  { mask: 4, network: 224n << 24n },          // 224.0.0.0/4 (multicast)
  { mask: 4, network: 240n << 24n },          // 240.0.0.0/4 (reserved)
];

function ipToInt(ip: string): bigint {
  const parts = ip.split('.').map(Number);
  return ((BigInt(parts[0]!) << 24n) |
          (BigInt(parts[1]!) << 16n) |
          (BigInt(parts[2]!) << 8n)  |
          BigInt(parts[3]!));
}

function isPrivateIp(ip: string): boolean {
  const addr = ipToInt(ip);
  for (const range of PRIVATE_RANGES) {
    const shifted = range.mask === 0 ? 0n : (1n << BigInt(32 - range.mask));
    if ((addr >> BigInt(32 - range.mask)) === (range.network >> BigInt(32 - range.mask))) {
      return true;
    }
  }
  return false;
}

async function validateUrlNotSsrf(urlStr: string): Promise<void> {
  const url = new URL(urlStr);

  const { address } = await dnsLookup(url.hostname, { family: 4 });

  if (isPrivateIp(address)) {
    throw new ValidationError(`URL hostname resolves to a private IP address: ${address}`);
  }
}

function generateSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

export async function registerEndpoint(sql: Sql, tenantId: string, input: RegisterEndpointInput): Promise<WebhookEndpoint> {
  await validateUrlNotSsrf(input.url);

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
