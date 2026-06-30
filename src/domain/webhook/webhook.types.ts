export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  eventTypes: string[];
  signingSecret: string;
  isActive: boolean;
  createdAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookEndpointId: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'succeeded' | 'failed' | 'abandoned';
  attemptCount: number;
  nextRetryAt: Date | null;
  lastResponseCode: number | null;
  lastResponseBody: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterEndpointInput {
  url: string;
  eventTypes?: string[];
  signingSecret?: string;
}
