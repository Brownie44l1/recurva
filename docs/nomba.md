# Nomba Integration Guide — Recurva

## 1. Account Structure

Recurva uses a parent-child account architecture. The parent account authenticates all requests; transactions are scoped to the sub-account.

| Parameter | Placeholder | Purpose |
|-----------|-------------|---------|
| `NOMBA_PARENT_ACCOUNT_ID` | `parent_account_id` | Passed in the `accountId` header on every request |
| `NOMBA_SUB_ACCOUNT_ID` | `sub_account_id` | Passed in URL paths/payloads for fund-moving endpoints |
| `NOMBA_LIVE_CLIENT_ID` | `live_client_id` | OAuth client ID for live env |
| `NOMBA_LIVE_PRIVATE_KEY` | `live_private_key` | OAuth client secret for live env |
| `NOMBA_TEST_CLIENT_ID` | `test_client_id` | OAuth client ID for sandbox env |
| `NOMBA_TEST_PRIVATE_KEY` | `test_private_key` | OAuth client secret for sandbox env |
| `NOMBA_INBOUND_WEBHOOK_SECRET` | `webhook_signing_key` | HMAC key to verify Nomba → Recurva webhooks |

## 2. Environment Setup

```bash
NOMBA_ENV=test                          # "test" | "live"
NOMBA_PARENT_ACCOUNT_ID=parent_account_id
NOMBA_SUB_ACCOUNT_ID=sub_account_id
NOMBA_TEST_CLIENT_ID=test_client_id
NOMBA_TEST_PRIVATE_KEY=test_private_key
NOMBA_LIVE_CLIENT_ID=live_client_id
NOMBA_LIVE_PRIVATE_KEY=live_private_key
NOMBA_INBOUND_WEBHOOK_SECRET=webhook_signing_key
```

### Base URLs

| Env | Base URL |
|-----|----------|
| test | `https://sandbox.nomba.com` |
| live | `https://api.nomba.com` |

### Auth Flow (OAuth 2.0 Client Credentials)

1. `POST /v1/auth/token/issue` with `grant_type=client_credentials` + client credentials. Header: `accountId: <parent_id>`.
2. Use the returned `access_token` as `Authorization: Bearer <token>` on all subsequent calls.
3. Tokens expire in **30 minutes**. Refresh via `POST /v1/auth/token/refresh` 5+ minutes before expiry.

## 3. Checkout Flow

### 3.1 Create Checkout Order

```http
POST /v1/checkout/order
Content-Type: application/json
Authorization: Bearer <token>
accountId: <parent_id>

{
  "order": {
    "amount": "5000.00",
    "currency": "NGN",
    "orderReference": "ref_unique",
    "customerEmail": "user@example.com",
    "customerId": "cust_123",
    "allowedPaymentMethods": ["Card"],
    "callbackUrl": "https://yourapp.com/nomba-callback"
  },
  "tokenizeCard": true
}
```

**Response** includes a `checkoutLink` — redirect the customer to this hosted payment page. After payment, Nomba calls the `callbackUrl` with the result.

### 3.2 Tokenized Card Payment (Recurring)

```http
POST /v1/checkout/tokenized-card-payment
Content-Type: application/json
Authorization: Bearer <token>
accountId: <parent_id>

{
  "order": {
    "orderReference": "ref_unique",
    "customerId": "cust_123",
    "amount": "5000.00",
    "currency": "NGN"
  },
  "tokenKey": "tok_<from checkout callback>"
}
```

**Sandbox note**: Sandbox always returns `data.status: true` synchronously regardless of token validity. It does not simulate declines for tokenized charges.

### 3.3 Checkout Transaction Query

```http
GET /v1/checkout/transaction?idType=ORDER_REFERENCE&id=<orderReference>
Authorization: Bearer <token>
accountId: <parent_id>
```

Works in both sandbox and production (contrary to some docs stating sandbox uses `/sandbox/checkout/...` prefix — that path returns 404).

## 4. Inbound Webhooks (Nomba → Recurva)

### Endpoint URLs

Submit these URLs to Nomba via the hackathon registration form:
- `https://recurva.xyz/webhooks/nomba` — charge/refund event notifications
- `https://recurva.xyz/webhooks/nomba/checkout` — checkout completion callbacks

### Signature Verification

Nomba signs every webhook payload with the `NOMBA_INBOUND_WEBHOOK_SECRET`. Verify the `nomba-signature` header:

```typescript
import * as crypto from 'crypto';

function verifyNombaSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

### Supported Inbound Events

| Event | Handler | Action |
|-------|---------|--------|
| `checkout.completed` | `/webhooks/nomba/checkout` | Persist card token, activate subscription |
| `charge.success` | `/webhooks/nomba` | Mark invoice as paid, emit outbound webhook |
| `charge.failed` | `/webhooks/nomba` | Enter dunning flow |

### Sandbox Webhook Caveat

**Webhook events do not fire in the sandbox environment.** Test webhook handling locally by sending mock payloads via curl.

## 5. Sandbox Test Findings (Empirical)

### Tokenized Charge Behavior

`POST /v1/checkout/tokenized-card-payment` always returns `data.status: true` synchronously in sandbox regardless of token validity. Production should return `data.status: false` for declined charges and fire a `charge.failed` webhook.

### Authorization Header Format

Both formats are accepted by the sandbox:
- `Authorization: Bearer <token>` (standard, recommended)
- `Authorization: <token>` (legacy, still accepted)

### API Path Correction

The sandbox uses the **same** `/v1/checkout/...` paths as production, *not* `/sandbox/checkout/...`. The `/sandbox/checkout/...` prefix returns 404.

### Transaction Query

`GET /v1/checkout/transaction` works on sandbox (despite some docs stating it is production-only).

### Direct Debit Endpoints

Direct Debit endpoints (`/v1/direct-debits/*`) returned 404 — this sandbox account lacked DD access. Requires Nomba support to enable.

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `403 Forbidden` on sub-account requests | `accountId` header set to sub-account ID | Use **parent** account ID in header |
| `403 Forbidden` on all requests | Environment mismatch (live creds on sandbox URL) | Match `NOMBA_ENV` with base URL |
| `401 Unauthorized` on webhooks | Signature verified against parsed JSON instead of raw body | Verify against raw body before parsing |
| Webhooks never arrive | Testing in sandbox (no webhooks fire) | Mock webhooks locally or test in live |
| Funds in wrong account | Virtual account created without `subAccountId` scoping | Include sub-account ID in VC paths |

### Rate Limits (from API docs)

- Checkout endpoints: 5 requests/second
- Account/Transactions: 10 requests/second
- Webhook delivery: managed internally
