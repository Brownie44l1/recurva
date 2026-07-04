import type { Tenant } from '../domain/tenant/tenant.types';
import type { ChargeInput, ChargeResult, CheckoutInput, CheckoutResult, RefundInput, RefundResult } from '../domain/nomba/nomba.types';
import { config } from '../config';
import { logger } from '../logger';
import { NombaTimeoutError } from '../errors';
import { reportBillingError } from '../observability/report-error';

const TIMEOUT_MS = config.NOMBA_REQUEST_TIMEOUT_MS;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function cacheKey(tenantId: string, baseUrl: string, clientId: string): string {
  return `${tenantId}:${baseUrl}:${clientId}`;
}

async function getAccessToken(tenantId: string, baseUrl: string, accountId: string, clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  const key = cacheKey(tenantId, baseUrl, clientId);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > now + 60 * 1000) {
    return cached.token;
  }

  if (!clientId || !clientSecret) {
    logger.warn('Nomba credentials missing, returning mock token for testing');
    return 'mock_token_for_testing';
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/auth/token/issue`, {
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new NombaTimeoutError(TIMEOUT_MS, 'getAccessToken');
    }
    throw err;
  }

  if (!response.ok) {
    const errText = await response.text();
    reportBillingError({ tenantId: accountId, status: response.status, errText }, 'Failed to issue Nomba access token');
    throw new Error(`Failed to issue Nomba access token: ${response.status} ${errText}`);
  }

  const body = (await response.json()) as { code: string; data: { access_token: string; expires_at: string } };
  const tokenData = body.data;
  if (!tokenData?.access_token) {
    throw new Error(`Nomba token response missing access_token: ${JSON.stringify(body)}`);
  }
  tokenCache.set(key, {
    token: tokenData.access_token,
    expiresAt: Date.now() + Math.max(
      tokenData.expires_at ? (new Date(tokenData.expires_at).getTime() - Date.now()) : 3600_000,
      60_000,
    ),
  });
  return tokenData.access_token;
}

export function createNombaClient(tenant: { id: string; nombaAccountId: string; mode?: 'test' | 'live' }) {
  const isLive = tenant.mode === 'live';
  const baseUrl = isLive ? config.NOMBA_LIVE_BASE_URL : config.NOMBA_SANDBOX_BASE_URL;
  const clientId = isLive ? config.NOMBA_LIVE_CLIENT_ID : config.NOMBA_TEST_CLIENT_ID;
  const clientSecret = isLive ? config.NOMBA_LIVE_PRIVATE_KEY : config.NOMBA_TEST_PRIVATE_KEY;
  const parentAccountId = config.NOMBA_PARENT_ACCOUNT_ID;

  async function request<T>(path: string, body: Record<string, unknown>): Promise<{ data: T } & Record<string, unknown>> {
    const token = await getAccessToken(tenant.id, baseUrl, parentAccountId, clientId, clientSecret);
    const url = `${baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'accountId': parentAccountId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        logger.error({ tenantId: tenant.id, path, timeoutMs: TIMEOUT_MS }, 'Nomba API request timed out');
        throw new NombaTimeoutError(TIMEOUT_MS, path);
      }
      throw err;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      reportBillingError({ tenantId: tenant.id, status: response.status, path, errorBody }, 'Nomba API error');
      throw new Error(`Nomba API error: ${response.status} ${errorBody}`);
    }

    const result = await response.json() as { code: string; data: T } & Record<string, unknown>;
    return result;
  }

  return {
    async charge(input: ChargeInput): Promise<ChargeResult> {
      const response = await request<{
        status: boolean; message: string; orderId: string | null; orderReference: string | null;
      }>('/v1/checkout/tokenized-card-payment', {
        order: {
          orderReference: input.transactionReference,
          customerId: input.metadata?.customerId || '',
          callbackUrl: input.callbackUrl,
          amount: String(input.amount),
          currency: input.currency,
          accountId: tenant.nombaAccountId,
        },
        tokenKey: input.token,
      });
      return {
        chargeId: response.data?.orderId ?? input.transactionReference,
        status: response.data?.status ? 'succeeded' : 'failed',
        amount: input.amount,
        currency: input.currency,
        transactionId: response.data?.orderReference ?? input.transactionReference,
      };
    },

    async checkout(input: CheckoutInput): Promise<CheckoutResult> {
      const response = await request<{
        success: boolean; message: string; checkoutLink: string; orderReference: string;
      }>('/v1/checkout/order', {
        order: {
          orderReference: input.orderReference,
          customerId: input.customerId,
          amount: String(input.amount),
          currency: input.currency,
          callbackUrl: input.callbackUrl,
          returnUrl: input.returnUrl,
          accountId: tenant.nombaAccountId,
          ...(input.metadata ? { orderMetaData: input.metadata } : {}),
        },
        tokenizeCard: input.saveCard ? 'true' : 'false',
      });
      return {
        checkoutUrl: response.data?.checkoutLink ?? '',
        orderReference: response.data?.orderReference ?? input.orderReference,
        status: response.data?.success ? 'success' : 'failed',
      };
    },

    async refund(input: RefundInput): Promise<RefundResult> {
      const response = await request<{
        status: boolean; message: string; refundId: string; amount: number;
      }>(`/v2/transfers/bank/${tenant.nombaAccountId}`, {
        transactionId: input.transactionId,
        amount: input.amount,
        reason: input.reason,
        reference: input.reference,
      });
      return {
        refundId: response.data?.refundId ?? 'unknown',
        status: response.data?.status ? 'succeeded' : 'failed',
        amount: input.amount,
      };
    },
  };
}
