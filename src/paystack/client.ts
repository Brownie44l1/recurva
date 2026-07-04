import { config } from '../config';
import { logger } from '../logger';

const TIMEOUT_MS = 15000;

async function paystackRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const secretKey = config.PAYSTACK_SECRET_KEY;
  const baseUrl = 'https://api.paystack.co';

  if (!secretKey) {
    logger.warn('Paystack secret key not configured, returning mock response');
    return {} as T;
  }

  const url = `${baseUrl}${path}`;

  let response: Response;
  try {
    const opts: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }
    response = await fetch(url, opts);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      logger.error({ path, timeoutMs: TIMEOUT_MS }, 'Paystack API request timed out');
      throw new Error(`Paystack API request timed out after ${TIMEOUT_MS}ms during ${path}`);
    }
    throw err;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error({ status: response.status, path, errorBody }, 'Paystack API error');
    throw new Error(`Paystack API error: ${response.status} ${errorBody}`);
  }

  const result = await response.json() as { status: boolean; message: string; data: T };
  if (!result.status) {
    throw new Error(`Paystack API error: ${result.message}`);
  }
  return result.data;
}

export function createPaystackClient() {
  return {
    async createCustomer(input: { email: string; name?: string; metadata?: Record<string, unknown> }): Promise<{ customerId: string; customerCode: string }> {
      const data = await paystackRequest<{
        id: number; customer_code: string; email: string;
      }>('POST', '/customer', {
        email: input.email,
        first_name: input.name?.split(' ')[0] ?? '',
        last_name: input.name?.split(' ').slice(1).join(' ') ?? '',
        metadata: input.metadata,
      });
      return {
        customerId: String(data.id),
        customerCode: data.customer_code,
      };
    },

    async charge(input: {
      amount: number;
      currency: string;
      authorizationCode: string;
      reference: string;
      email: string;
      metadata?: Record<string, unknown>;
    }): Promise<{
      id: number;
      status: string;
      reference: string;
      amount: number;
      currency: string;
    }> {
      const data = await paystackRequest<{
        id: number;
        status: string;
        reference: string;
        amount: number;
        currency: string;
        gateway_response: string;
      }>('POST', '/transaction/charge_authorization', {
        authorization_code: input.authorizationCode,
        email: input.email,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        reference: input.reference,
        metadata: input.metadata,
      });
      return {
        id: data.id,
        status: data.status === 'success' ? 'succeeded' : data.status,
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
      };
    },

    async initializeTransaction(input: {
      email: string;
      amount: number;
      currency: string;
      reference: string;
      callbackUrl: string;
      metadata?: Record<string, unknown>;
    }): Promise<{ authorizationUrl: string; reference: string; accessCode: string }> {
      const data = await paystackRequest<{
        authorization_url: string;
        reference: string;
        access_code: string;
      }>('POST', '/transaction/initialize', {
        email: input.email,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      });
      return {
        authorizationUrl: data.authorization_url,
        reference: data.reference,
        accessCode: data.access_code,
      };
    },

    async refund(input: {
      transactionReference: string;
      amount?: number;
      reason?: string;
    }): Promise<{ refundId: number; status: string }> {
      const data = await paystackRequest<{
        id: number;
        status: string;
        transaction_reference: string;
      }>('POST', '/refund', {
        transaction: input.transactionReference,
        amount: input.amount,
        reason: input.reason,
      });
      return {
        refundId: data.id,
        status: data.status === 'success' ? 'succeeded' : data.status,
      };
    },

    async getTransactionStatus(reference: string): Promise<{
      status: string;
      amount: number;
      currency: string;
      paidAt?: string;
      failureCode?: string;
      failureMessage?: string;
    }> {
      const data = await paystackRequest<{
        status: string;
        amount: number;
        currency: string;
        paid_at: string | null;
        gateway_response: string;
        transaction_date: string;
      }>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
      return {
        status: data.status === 'success' ? 'succeeded' : data.status,
        amount: data.amount,
        currency: data.currency,
        paidAt: data.paid_at ?? undefined,
        failureCode: data.status !== 'success' ? data.status : undefined,
        failureMessage: data.status !== 'success' ? data.gateway_response : undefined,
      };
    },
  };
}
