import type { Tenant } from '../domain/tenant/tenant.types';
import type { ChargeInput, ChargeResult, CheckoutInput, CheckoutResult, RefundInput, RefundResult } from '../domain/nomba/nomba.types';
import { config } from '../config';
import { logger } from '../logger';

export function createNombaClient(tenant: { id: string; nombaAccountId: string; mode: 'test' | 'live' }) {
  const isLive = tenant.mode === 'live';
  const baseUrl = isLive ? config.NOMBA_LIVE_BASE_URL : config.NOMBA_SANDBOX_BASE_URL;
  const secretKey = isLive ? config.NOMBA_LIVE_SECRET : config.NOMBA_SANDBOX_SECRET;

  async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secretKey}`,
        'X-Account-ID': tenant.nombaAccountId,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ tenantId: tenant.id, status: response.status, path, errorBody }, 'Nomba API error');
      throw new Error(`Nomba API error: ${response.status} ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    async charge(input: ChargeInput): Promise<ChargeResult> {
      return request<ChargeResult>(`/v1/accounts/${tenant.nombaAccountId}/charges/tokenized`, {
        token: input.token,
        amount: input.amount,
        currency: input.currency,
        transactionReference: input.transactionReference,
        callbackUrl: input.callbackUrl,
        metadata: input.metadata,
      });
    },

    async checkout(input: CheckoutInput): Promise<CheckoutResult> {
      return request<CheckoutResult>('/v1/checkout/order', {
        orderReference: input.orderReference,
        customerId: input.customerId,
        amount: input.amount,
        currency: input.currency,
        callbackUrl: input.callbackUrl,
        returnUrl: input.returnUrl,
        saveCard: input.saveCard,
        metadata: input.metadata,
      });
    },

    async refund(input: RefundInput): Promise<RefundResult> {
      return request<RefundResult>('/v1/accounts/refunds', {
        transactionId: input.transactionId,
        amount: input.amount,
        reason: input.reason,
        reference: input.reference,
      });
    },
  };
}
