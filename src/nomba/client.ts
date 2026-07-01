import type { Tenant } from '../domain/tenant/tenant.types';
import type { ChargeInput, ChargeResult, CheckoutInput, CheckoutResult, RefundInput, RefundResult } from '../domain/nomba/nomba.types';
import { config } from '../config';
import { logger } from '../logger';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(baseUrl: string, accountId: string, clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60 * 1000) {
    return cachedToken;
  }

  // Safety check to allow testing/mocking without credentials
  if (!clientId || !clientSecret) {
    logger.warn('Nomba credentials missing, returning mock token for testing');
    return 'mock_token_for_testing';
  }

  const response = await fetch(`${baseUrl}/v1/auth/token/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'accountId': accountId,
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error({ status: response.status, errText }, 'Failed to issue Nomba access token');
    throw new Error(`Failed to issue Nomba access token: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

export function createNombaClient(tenant: { id: string; nombaAccountId: string }) {
  const isLive = config.NOMBA_ENV === 'live';
  const baseUrl = isLive ? 'https://api.nomba.com' : 'https://sandbox.nomba.com';
  const clientId = isLive ? config.NOMBA_LIVE_CLIENT_ID : config.NOMBA_TEST_CLIENT_ID;
  const clientSecret = isLive ? config.NOMBA_LIVE_PRIVATE_KEY : config.NOMBA_TEST_PRIVATE_KEY;
  const parentAccountId = config.NOMBA_PARENT_ACCOUNT_ID;

  async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const token = await getAccessToken(baseUrl, parentAccountId, clientId, clientSecret);
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'accountId': parentAccountId,
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
      // Endpoint to charge tokenized cards: /v1/checkout/tokenized-card-payment
      return request<ChargeResult>('/v1/checkout/tokenized-card-payment', {
        order: {
          orderReference: input.transactionReference,
          customerId: input.metadata?.customerId || '',
          callbackUrl: input.callbackUrl,
          amount: String(input.amount),
          currency: input.currency,
          accountId: tenant.nombaAccountId, // Scoped to sub-account ID
        },
        tokenKey: input.token,
      });
    },

    async checkout(input: CheckoutInput): Promise<CheckoutResult> {
      // Endpoint to create checkout order: /v1/checkout/order
      return request<CheckoutResult>('/v1/checkout/order', {
        order: {
          orderReference: input.orderReference,
          customerId: input.customerId,
          amount: String(input.amount),
          currency: input.currency,
          callbackUrl: input.callbackUrl,
          returnUrl: input.returnUrl,
          accountId: tenant.nombaAccountId, // Scoped to sub-account ID
          orderMetaData: input.metadata,
        },
        tokenizeCard: input.saveCard ? 'true' : 'false',
      });
    },

    async refund(input: RefundInput): Promise<RefundResult> {
      // Refund endpoint requires sub-account scoping
      return request<RefundResult>(`/v2/transfers/bank/${tenant.nombaAccountId}`, {
        transactionId: input.transactionId,
        amount: input.amount,
        reason: input.reason,
        reference: input.reference,
      });
    },
  };
}
