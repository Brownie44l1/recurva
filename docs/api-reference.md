# Recurva API Reference

Base URL: `https://api.recurva.com/v1`
Webhooks: `https://api.recurva.com/webhooks/nomba`

## Authentication

### API Key (Machine-to-Machine)

All `/v1/*` endpoints (except `/v1/tenants/register` and `/v1/portal/auth/*`) require a tenant API key:

```
Authorization: Bearer rcv_live_<32-char-hex>
```

Keys are issued at tenant registration. Store securely — the raw key is shown only once.

### Dashboard JWT (Admin UI)

Dashboard and report endpoints use a separate JWT obtained via `POST /v1/dashboard/auth`:

```json
// Response
{ "token": "<jwt>", "tenantId": "<uuid>" }
```

Pass in subsequent requests:

```
Authorization: Bearer <jwt>
```

Dashboard JWTs expire after 24 hours.

### Portal JWT (Customer Self-Serve)

Portal endpoints use a session JWT obtained via the magic-link flow (`/v1/portal/auth/request` → `/v1/portal/auth/verify`):

```
Authorization: Bearer <jwt>
```

### Nomba HMAC (Inbound Webhooks)

Inbound Nomba webhooks are authenticated via HMAC-SHA256 signature verification. See [Webhooks > Inbound](#inbound-nomba-webhooks) for details.

---

## Error Handling

All errors return a consistent JSON structure:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable description"
  },
  "requestId": "<uuid>"
}
```

### Common HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (invalid input) |
| 401 | Unauthorized (missing/invalid auth) |
| 403 | Forbidden (valid auth, insufficient permissions) |
| 404 | Resource not found |
| 409 | Conflict (duplicate) |
| 422 | Unprocessable entity (validation error) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `missing_api_key` | 401 | No `Authorization` header |
| `invalid_api_key` | 401 | Key not found or inactive |
| `invalid_token` | 401 | JWT expired or malformed |
| `forbidden` | 403 | Valid auth but wrong role |
| `not_found` | 404 | Resource doesn't exist |
| `validation_error` | 422 | Zod validation failed |
| `internal_error` | 500 | Unexpected server error |

---

## Endpoints

### Health

#### `GET /health`

Check API and database liveness.

**Auth:** None

**Response 200:**
```json
{
  "status": "ok",
  "db": "ok",
  "uptime": 12345
}
```

**Response 503 (DB down):**
```json
{
  "status": "degraded",
  "db": "error",
  "uptime": 12345
}
```

---

### Tenants

#### `POST /v1/tenants/register`

Create a new tenant and receive an API key.

**Auth:** None

**Request:**
```json
{
  "name": "My Company",
  "email": "admin@company.com"
}
```

**Response 201:**
```json
{
  "tenant": {
    "id": "uuid",
    "name": "My Company",
    "email": "admin@company.com"
  },
  "apiKey": "rcv_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
}
```

#### `GET /v1/tenants/me`

Get the current tenant's profile.

**Auth:** API Key

**Response 200:**
```json
{
  "tenant": {
    "id": "uuid",
    "name": "My Company",
    "email": "admin@company.com",
    "isActive": true
  }
}
```

#### `POST /v1/tenants/api-keys`

Generate a new API key for the current tenant.

**Auth:** API Key

**Response 201:**
```json
{
  "apiKey": "rcv_live_x1y2z3...",
  "keyPrefix": "rcv_live_x1y2"
}
```

---

### Plans

#### `POST /v1/plans`

Create a new plan with pricing.

**Auth:** API Key

**Request:**
```json
{
  "name": "Professional",
  "description": "For small teams",
  "billingType": "fixed",
  "interval": "month",
  "intervalCount": 1,
  "trialDays": 14,
  "prices": [
    { "currency": "NGN", "amount": 500000 },
    { "currency": "USD", "amount": 1000 }
  ]
}
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | 1–255 characters |
| `description` | string | no | Max 1000 characters |
| `billingType` | enum | yes | `fixed`, `metered`, or `mixed` |
| `interval` | enum | yes | `day`, `week`, `month`, `year` |
| `intervalCount` | int | no | Default 1 |
| `trialDays` | int | no | Must be ≥ 0 |
| `prices` | array | yes | At least one price object |

**Price Object:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `currency` | enum | yes | `NGN`, `USD`, `GBP`, `EUR` |
| `amount` | int | yes | In kobo/cents (smallest unit) |
| `unitAmount` | int | no | Per-unit amount for metered billing |

**Response 201:**
```json
{
  "plan": { "...full plan object..." }
}
```

#### `GET /v1/plans`

List all plans.

**Auth:** API Key

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by `fixed`, `metered`, or `mixed` |
| `archived` | bool | Include archived plans (default: false) |

**Response 200:**
```json
{
  "plans": [ "...plan objects..." ]
}
```

#### `GET /v1/plans/:id`

Get a single plan.

**Auth:** API Key

**Response 200:**
```json
{
  "plan": { "...full plan object..." }
}
```

**Response 404:**
```json
{
  "error": { "code": "not_found", "message": "Plan not found" }
}
```

#### `PATCH /v1/plans/:id`

Update a plan.

**Auth:** API Key

**Request (partial):**
```json
{
  "name": "Professional Plus",
  "prices": [
    { "currency": "NGN", "amount": 750000 }
  ]
}
```

**Response 200:**
```json
{
  "plan": { "...updated plan object..." }
}
```

#### `DELETE /v1/plans/:id`

Archive a plan. Existing subscriptions continue billing.

**Auth:** API Key

**Response 200:**
```json
{
  "plan": { "...archived plan object with archivedAt set..." }
}
```

---

### Coupons

#### `POST /v1/coupons`

Create a coupon.

**Auth:** API Key

**Request:**
```json
{
  "code": "SAVE20",
  "discountType": "percentage",
  "discountValue": 20,
  "duration": "repeating",
  "durationMonths": 3,
  "maxRedemptions": 100,
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | 1–50 chars, auto-uppercased |
| `discountType` | enum | yes | `percentage` or `fixed_amount` |
| `discountValue` | int | yes | Percentage (1–100) or fixed amount in kobo |
| `currency` | enum | if `fixed_amount` | `NGN`, `USD`, `GBP`, `EUR` |
| `duration` | enum | yes | `once`, `repeating`, or `forever` |
| `durationMonths` | int | if `repeating` | Number of months to apply |
| `maxRedemptions` | int | no | Usage limit |
| `expiresAt` | ISO datetime | no | Expiry timestamp |

**Response 201:**
```json
{
  "coupon": { "...full coupon object..." }
}
```

#### `GET /v1/coupons`

List coupons.

**Auth:** API Key

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `active` | bool | Filter to active (non-archived) coupons |

**Response 200:**
```json
{
  "coupons": [ "...coupon objects..." ]
}
```

#### `GET /v1/coupons/:id`

Get a single coupon.

**Auth:** API Key

**Response 200:** `{ "coupon": { "...full coupon object..." } }`

#### `POST /v1/coupons/validate`

Validate a coupon code without applying it.

**Auth:** API Key

**Request:**
```json
{
  "code": "SAVE20",
  "currency": "NGN"
}
```

**Response 200:**
```json
{
  "valid": true,
  "coupon": { "...coupon details..." }
}
```

**Response (invalid):** 422 with error code `coupon_expired`, `coupon_exhausted`, etc.

#### `DELETE /v1/coupons/:id`

Archive a coupon.

**Auth:** API Key

**Response 200:**
```json
{
  "coupon": { "...archived coupon object..." }
}
```

---

### Customers

#### `POST /v1/customers`

Create a customer.

**Auth:** API Key

**Request:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "currency": "NGN",
  "metadata": { "referral": "friend" }
}
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `externalId` | string | no | Your external ID for this customer |
| `email` | string | yes | Valid email, unique per tenant |
| `name` | string | no | Max 255 characters |
| `currency` | enum | no | Default `NGN` |
| `metadata` | object | no | Arbitrary JSON |

**Response 201:**
```json
{
  "customer": { "...full customer object..." }
}
```

**Response 409:**
```json
{
  "error": { "code": "duplicate_email", "message": "Customer with this email already exists" }
}
```

#### `GET /v1/customers`

List or find customers.

**Auth:** API Key

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `email` | string | Exact-match lookup by email |
| `limit` | int | Default 20, max 100 |
| `offset` | int | Default 0 |

With `email`:
```json
{ "customer": { "...customer object or null..." } }
```

Without `email`:
```json
{ "customers": [ "...array..." ] }
```

#### `GET /v1/customers/:id`

Get a single customer.

**Auth:** API Key

**Response 200:**
```json
{
  "customer": {
    "...full customer object with payment method count..."
  }
}
```

#### `PATCH /v1/customers/:id`

Update a customer.

**Auth:** API Key

**Request (partial):**
```json
{
  "name": "Jane Doe",
  "metadata": { "tier": "premium" }
}
```

Note: `metadata` is deep-merged (not replaced).

**Response 200:**
```json
{ "customer": { "...updated customer object..." } }
```

#### `DELETE /v1/customers/:id`

Soft-delete a customer.

**Auth:** API Key

**Response 200:**
```json
{ "success": true }
```

**Response 409:** If customer has active subscriptions.

---

### Payment Methods

#### `GET /v1/payment-methods/customers/:customerId/payment-methods`

List all payment methods for a customer.

**Auth:** API Key

**Response 200:**
```json
{
  "paymentMethods": [ "...array of payment method objects..." ]
}
```

#### `POST /v1/payment-methods/customers/:customerId/payment-methods`

Manually add a payment method (typically done via Nomba checkout callback instead).

**Auth:** API Key

**Request:**
```json
{
  "nombaToken": "tok_abc123",
  "cardLast4": "4242",
  "cardBrand": "visa",
  "cardExpMonth": 12,
  "cardExpYear": 2027
}
```

**Response 201:**
```json
{
  "paymentMethod": { "...payment method object..." }
}
```

#### `PATCH /v1/payment-methods/customers/:customerId/payment-methods/:pmId/primary`

Promote a payment method to primary. Demotes the existing primary.

**Auth:** API Key

**Response 200:**
```json
{ "success": true }
```

#### `DELETE /v1/payment-methods/customers/:customerId/payment-methods/:pmId`

Remove a payment method. Blocks if it's the only card on an active subscription.

**Auth:** API Key

**Response 200:**
```json
{ "success": true }
```

**Response 409:**
```json
{
  "error": { "code": "cannot_remove_last_method", "message": "Cannot remove last payment method on an active subscription" }
}
```

---

### Subscriptions

#### `POST /v1/subscriptions`

Create a subscription.

**Auth:** API Key

**Request:**
```json
{
  "customerId": "uuid",
  "planId": "uuid",
  "currency": "NGN",
  "couponCode": "SAVE20",
  "paymentMethodId": "uuid",
  "trialDays": 7,
  "metadata": { "source": "signup" }
}
```

**Behavior:**
- If `paymentMethodId` provided: attempts immediate charge → `active` on success, `incomplete` on failure
- If no `paymentMethodId` and no `trialDays`: subscription created as `incomplete`; checkout session URL returned
- If `trialDays` set: subscription created as `trialing`
- `couponCode` validated and linked if provided

**Response 201:**
```json
{
  "subscription": { "...subscription object..." },
  "checkoutUrl": "https://nomba.com/checkout/abc123"
}
```

The `checkoutUrl` is only present when the subscription is created `incomplete` (no payment method).

#### `GET /v1/subscriptions`

List subscriptions.

**Auth:** API Key

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status |
| `limit` | int | Default 20, max 100 |
| `offset` | int | Default 0 |

**Response 200:**
```json
{
  "subscriptions": [ "...subscription objects..." ]
}
```

#### `GET /v1/subscriptions/:id`

Get a single subscription with plan and customer info.

**Auth:** API Key

**Response 200:**
```json
{
  "subscription": { "...full subscription object..." }
}
```

#### `GET /v1/subscriptions/customer/:customerId`

Get all subscriptions for a customer.

**Auth:** API Key

**Response 200:**
```json
{
  "subscriptions": [ "...array..." ]
}
```

#### `POST /v1/subscriptions/:id/cancel`

Cancel a subscription.

**Auth:** API Key

**Request:**
```json
{
  "cancelAtPeriodEnd": true,
  "reason": "Customer requested cancellation"
}
```

- `cancelAtPeriodEnd: true` — sets `cancel_at_period_end` flag; subscription remains `active` until period end
- `cancelAtPeriodEnd: false` (default) — immediate cancellation; proration credit computed

**Response 200:**
```json
{
  "subscription": { "...updated subscription object..." }
}
```

#### `POST /v1/subscriptions/:id/pause`

Pause an active subscription. Freezes the billing period.

**Auth:** API Key

**Response 200:**
```json
{
  "subscription": { "...paused subscription object..." }
}
```

#### `POST /v1/subscriptions/:id/resume`

Resume a paused subscription. Extends `current_period_end` by pause duration.

**Auth:** API Key

**Response 200:**
```json
{
  "subscription": { "...resumed subscription object..." }
}
```

#### `POST /v1/subscriptions/:id/change-plan`

Change a subscription's plan mid-cycle with proration.

**Auth:** API Key

**Request:**
```json
{
  "newPlanId": "uuid",
  "immediate": false
}
```

Proration invoice generated with credit (unused time on old plan) and charge (remaining time on new plan).

**Response 200:**
```json
{
  "subscription": { "...updated subscription object..." }
}
```

---

### Usage (Metered Billing)

#### `POST /v1/subscriptions/:id/usage`

Report a usage event for a metered subscription.

**Auth:** API Key

**Request:**
```json
{
  "idempotencyKey": "unique-key-123",
  "quantity": 100,
  "timestamp": "2026-06-15T10:30:00Z"
}
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `idempotencyKey` | string | yes | 1–255 chars, unique per subscription |
| `quantity` | int | yes | Must be ≥ 0 |
| `timestamp` | ISO datetime | yes | Event time (not server receive time) |

**Response 201:**
```json
{
  "usage": { "...usage record object..." }
}
```

**Response 422:** If subscription is on a non-metered plan.

#### `GET /v1/subscriptions/:id/usage`

Get usage summary for current and previous billing periods.

**Auth:** API Key

**Response 200:**
```json
{
  "currentPeriod": { "start": "...", "end": "...", "quantity": 1500 },
  "previousPeriod": { "start": "...", "end": "...", "quantity": 1200 },
  "records": [ "...paginated usage records..." ]
}
```

---

### Invoices

#### `GET /v1/invoices`

List invoices for a customer.

**Auth:** API Key

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `customerId` | string (uuid) | **Required** — filter by customer |
| `limit` | int | Default 20, max 100 |
| `offset` | int | Default 0 |

**Response 200:**
```json
{
  "invoices": [ "...invoice objects..." ]
}
```

#### `GET /v1/invoices/:id`

Get a single invoice with line items.

**Auth:** API Key

**Response 200:**
```json
{
  "invoice": { "...full invoice object..." }
}
```

#### `POST /v1/invoices/:id/retry`

Retry a failed/open invoice charge.

**Auth:** API Key

**Response 200:**
```json
{
  "invoice": { "...updated invoice object..." }
}
```

#### `POST /v1/invoices/:id/void`

Void an open or draft invoice.

**Auth:** API Key

**Response 200:**
```json
{
  "invoice": { "...voided invoice object..." }
}
```

---

### Webhook Endpoints

#### `POST /v1/webhooks/endpoints`

Register a webhook endpoint to receive outbound events.

**Auth:** API Key

**Request:**
```json
{
  "url": "https://myapp.com/webhooks/recurva",
  "eventTypes": ["subscription.created", "invoice.paid"],
  "signingSecret": "whsec_abc123"
}
```

If `signingSecret` is omitted, one is auto-generated.

**Response 201:**
```json
{
  "endpoint": {
    "id": "uuid",
    "url": "https://myapp.com/webhooks/recurva",
    "eventTypes": ["subscription.created", "invoice.paid"],
    "enabled": true,
    "createdAt": "..."
  }
}
```

Note: `signingSecret` is returned only at creation.

#### `GET /v1/webhooks/endpoints`

List all webhook endpoints.

**Auth:** API Key

**Response 200:**
```json
{
  "endpoints": [ "...endpoint objects..." ]
}
```

#### `GET /v1/webhooks/endpoints/:id`

Get a single webhook endpoint.

**Auth:** API Key

**Response 200:**
```json
{
  "endpoint": { "...endpoint object..." }
}
```

#### `PATCH /v1/webhooks/endpoints/:id`

Update a webhook endpoint.

**Auth:** API Key

**Request (partial):**
```json
{
  "url": "https://myapp.com/webhooks/recurva-v2",
  "eventTypes": ["subscription.*"],
  "enabled": true
}
```

**Response 200:**
```json
{
  "endpoint": { "...updated endpoint object..." }
}
```

#### `DELETE /v1/webhooks/endpoints/:id`

Remove a webhook endpoint.

**Auth:** API Key

**Response 200:**
```json
{
  "status": "deleted"
}
```

#### `GET /v1/webhooks/endpoints/:id/deliveries`

List delivery attempts for an endpoint.

**Auth:** API Key

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `limit` | int | Default 100, max 200 |

**Response 200:**
```json
{
  "deliveries": [ "...delivery objects with attempt details..." ]
}
```

#### `POST /v1/webhooks/deliveries/:id/retry`

Manually retry a failed delivery.

**Auth:** API Key

**Response 200:**
```json
{
  "status": "queued"
}
```

**Response 422:** If delivery is not in `failed` status.

---

### Portal (Customer Self-Serve)

#### `POST /v1/portal/auth/request`

Request a magic link for portal access.

**Auth:** None

**Request:**
```json
{
  "customerId": "uuid",
  "tenantId": "uuid"
}
```

**Response 200:**
```json
{
  "status": "sent",
  "magicToken": "<jwt>"
}
```

Note: In production, the magic link would be emailed. For development, the token is returned directly.

#### `GET /v1/portal/auth/verify`

Verify magic link token and receive session JWT.

**Auth:** None

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `token` | string (JWT) | **Required** — the magic link token |

**Response 200:**
```json
{
  "session": {
    "token": "<jwt>",
    "expiresAt": "...",
    "portalUrl": "/portal/session?token=..."
  }
}
```

#### `GET /v1/portal/subscriptions`

List the authenticated customer's subscriptions.

**Auth:** Portal JWT

**Response 200:**
```json
{
  "subscriptions": [ "...subscriptions with plan name..." ]
}
```

#### `GET /v1/portal/invoices`

List the authenticated customer's invoices.

**Auth:** Portal JWT

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `limit` | int | Default 20, max 100 |
| `offset` | int | Default 0 |

**Response 200:**
```json
{
  "invoices": [ "...invoice objects..." ]
}
```

#### `GET /v1/portal/invoices/:id/download`

Download an invoice (JSON format).

**Auth:** Portal JWT

**Response 200:**
```json
{
  "invoice": { "...full invoice object..." }
}
```

#### `POST /v1/portal/subscriptions/:id/cancel`

Cancel a subscription (end-of-period only in portal).

**Auth:** Portal JWT

**Response 200:**
```json
{
  "status": "scheduled_for_cancellation"
}
```

#### `POST /v1/portal/subscriptions/:id/pause`

Pause an active subscription.

**Auth:** Portal JWT

**Response 200:**
```json
{
  "status": "paused"
}
```

#### `POST /v1/portal/subscriptions/:id/resume`

Resume a paused subscription.

**Auth:** Portal JWT

**Response 200:**
```json
{
  "status": "resumed"
}
```

#### `POST /v1/portal/subscriptions/:id/change-plan`

Change subscription plan.

**Auth:** Portal JWT

**Request:**
```json
{
  "newPlanId": "uuid"
}
```

**Response 200:**
```json
{
  "status": "plan_changed"
}
```

---

### Dashboard (Admin)

#### `POST /v1/dashboard/auth`

Authenticate as a dashboard admin.

**Auth:** None

**Request:**
```json
{
  "email": "admin@company.com",
  "password": "your-password"
}
```

**Response 200:**
```json
{
  "token": "<jwt>",
  "tenantId": "uuid"
}
```

#### `GET /v1/dashboard/metrics`

Get core SaaS metrics.

**Auth:** Dashboard JWT

**Response 200:**
```json
{
  "subscribers": {
    "active": 142,
    "trialing": 23,
    "past_due": 5,
    "cancelled": 67
  },
  "mrr": [
    { "currency": "NGN", "mrr": 12500000 },
    { "currency": "USD", "mrr": 45000 }
  ],
  "churnRate": 3.45
}
```

#### `GET /v1/dashboard/dunning-metrics`

Get dunning health metrics.

**Auth:** Dashboard JWT

**Response 200:**
```json
{
  "failedToday": 3,
  "failedTotal": 47,
  "recoveryRate": 68.5,
  "scheduledAttempts": 12
}
```

---

### Reports

#### `GET /v1/reports/revenue`

Revenue report by period.

**Auth:** Dashboard JWT

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | ISO date | 90 days ago | Start date |
| `to` | ISO date | today | End date |
| `interval` | enum | `monthly` | `daily` or `monthly` |
| `currency` | string | all | Filter by currency code |

**Response 200:**
```json
{
  "revenue": [
    {
      "period": "2026-06",
      "currency": "NGN",
      "amount": 12500000,
      "invoiceCount": 85
    }
  ]
}
```

#### `GET /v1/reports/cohorts`

Subscriber cohort retention report.

**Auth:** Dashboard JWT

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | ISO date | 365 days ago | Start date |
| `to` | ISO date | today | End date |

**Response 200:**
```json
{
  "cohorts": [
    {
      "cohort": "2026-01",
      "months": [100, 82, 74, 68, 65],
      "periods": ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]
    }
  ]
}
```

#### `GET /v1/reports/clv`

Customer lifetime value by plan.

**Auth:** Dashboard JWT

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | ISO date | 90 days ago | Start date |
| `to` | ISO date | today | End date |

**Response 200:**
```json
{
  "clv": [
    {
      "planId": "uuid",
      "planName": "Professional",
      "customerCount": 45,
      "totalRevenue": 22500000,
      "averageClv": 500000
    }
  ]
}
```

#### `GET /v1/reports/dunning`

Dunning attempt outcomes by month.

**Auth:** Dashboard JWT

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | ISO date | 90 days ago | Start date |
| `to` | ISO date | today | End date |

**Response 200:**
```json
{
  "dunning": [
    {
      "month": "2026-06",
      "attempts": 120,
      "recovered": 45,
      "failed": 68,
      "exhausted": 7,
      "recovered_amount": 2250000
    }
  ]
}
```

#### `GET /v1/reports/reconciliation`

Invoice-charge reconciliation report.

**Auth:** Dashboard JWT

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | ISO date | 90 days ago | Start date |
| `to` | ISO date | today | End date |

**Response 200:**
```json
{
  "paidInvoicesWithoutCharge": [ "...invoices paid but missing charge records..." ],
  "openInvoicesWithCharge": [ "...open invoices that have associated charge records..." ]
}
```

---

## Inbound Nomba Webhooks

These are called directly by Nomba (no `/v1` prefix).

### `POST /webhooks/nomba/checkout`

Handles the post-checkout callback after a customer completes card payment on Nomba's hosted checkout page. Extracts card token and creates a payment method.

**Auth:** HMAC-SHA256 signature verification

**Headers:**
| Header | Description |
|--------|-------------|
| `X-Nomba-Signature` | HMAC-SHA256 hex digest of raw request body |

**Request Body:**
```json
{
  "event": "checkout.completed",
  "data": {
    "orderReference": "ref_abc123",
    "status": "success",
    "token": "tok_card_xyz",
    "last4": "4242",
    "cardBrand": "visa",
    "expMonth": 12,
    "expYear": 2027,
    "amount": 500000,
    "currency": "NGN",
    "transactionId": "txn_abc123"
  }
}
```

**Response 200:**
```json
{
  "status": "processed",
  "paymentMethodId": "uuid"
}
```

### `POST /webhooks/nomba`

Generic Nomba event webhook receiver. Supports `charge.success`, `charge.failure`, `refund.completed`.

**Auth:** HMAC-SHA256 signature verification via `X-Nomba-Signature` header.

**Request Body:**
```json
{
  "event": "charge.success",
  "data": { "...event-specific payload..." },
  "eventId": "evt_abc123",
  "timestamp": "2026-06-15T10:30:00Z"
}
```

**Response 200:**
```json
{
  "status": "processed"
}
```

Supported event types and their effects:

| Event | Effect |
|-------|--------|
| `charge.success` | Invoice marked `paid`, subscription → `active` if was `past_due`/`incomplete` |
| `charge.failure` | Failure logged, dunning scheduling triggered |
| `refund.completed` | Charge marked `refunded` |

---

## Outbound Webhook Events

Recurva sends webhook events to registered endpoints. Each delivery is signed with the endpoint's `signingSecret`.

### Headers

| Header | Description |
|--------|-------------|
| `X-Recurva-Signature` | `sha256=<hmac>` of the payload |
| `Content-Type` | `application/json` |
| `User-Agent` | `Recurva/1.0` |

### Event Catalog

#### `subscription.created`

Triggered when a new subscription is created.

```json
{
  "event": "subscription.created",
  "data": {
    "id": "uuid",
    "customerId": "uuid",
    "planId": "uuid",
    "status": "active",
    "currency": "NGN",
    "currentPeriodStart": "2026-06-01T00:00:00Z",
    "currentPeriodEnd": "2026-07-01T00:00:00Z"
  },
  "timestamp": "2026-06-01T00:00:00Z"
}
```

#### `subscription.cancelled`

Triggered when a subscription is cancelled (immediate or at period end).

```json
{
  "event": "subscription.cancelled",
  "data": {
    "id": "uuid",
    "customerId": "uuid",
    "planId": "uuid",
    "status": "cancelled",
    "cancelledAt": "2026-06-15T10:30:00Z",
    "cancelAtPeriodEnd": false,
    "reason": "Customer requested"
  },
  "timestamp": "2026-06-15T10:30:00Z"
}
```

#### `subscription.updated`

Triggered on pause, resume, plan change, or status transitions.

```json
{
  "event": "subscription.updated",
  "data": {
    "id": "uuid",
    "status": "paused",
    "previousStatus": "active",
    "pausedAt": "2026-06-15T10:30:00Z"
  },
  "timestamp": "2026-06-15T10:30:00Z"
}
```

#### `subscription.dunning_failed`

Triggered when dunning attempts are exhausted.

```json
{
  "event": "subscription.dunning_failed",
  "data": {
    "id": "uuid",
    "customerId": "uuid",
    "planId": "uuid",
    "status": "cancelled",
    "reason": "dunning_exhausted"
  },
  "timestamp": "2026-06-15T10:30:00Z"
}
```

#### `invoice.paid`

Triggered when an invoice is successfully paid.

```json
{
  "event": "invoice.paid",
  "data": {
    "id": "uuid",
    "subscriptionId": "uuid",
    "customerId": "uuid",
    "currency": "NGN",
    "total": 500000,
    "paidAt": "2026-06-15T10:30:00Z",
    "periodStart": "2026-06-01T00:00:00Z",
    "periodEnd": "2026-07-01T00:00:00Z"
  },
  "timestamp": "2026-06-15T10:30:00Z"
}
```

#### `invoice.payment_failed`

Triggered when an invoice charge attempt fails.

```json
{
  "event": "invoice.payment_failed",
  "data": {
    "id": "uuid",
    "subscriptionId": "uuid",
    "customerId": "uuid",
    "currency": "NGN",
    "total": 500000,
    "failureCode": "insufficient_funds",
    "failureMessage": "Insufficient funds"
  },
  "timestamp": "2026-06-15T10:30:00Z"
}
```

#### `customer.created`

Triggered when a new customer is created.

```json
{
  "event": "customer.created",
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2026-06-15T10:30:00Z"
  },
  "timestamp": "2026-06-15T10:30:00Z"
}
```

### Delivery & Retry

- Failed deliveries retry at: 1 min, 5 min, 30 min, 2 hr, 8 hr
- After 5 failed attempts, delivery is marked `failed` permanently
- Manual retry available via `POST /v1/webhooks/deliveries/:id/retry`

### Signature Verification

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

---

## Pagination

List endpoints support pagination via `limit` and `offset` query parameters.

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `limit` | 20 | 100 | Number of results per page |
| `offset` | 0 | — | Number of results to skip |

---

## Rate Limiting

| Endpoint | Rate Limit |
|----------|------------|
| `/webhooks/nomba` | 100 req/min per IP |
| All other endpoints | 1000 req/min per tenant |

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1623769200
```

---

## Idempotency

Key mutating endpoints support idempotency via the `Idempotency-Key` header. Send a unique key (UUID recommended) with your request. If the request is retried with the same key, the server returns the original result without performing the action again.

Supported endpoints:
- `POST /v1/subscriptions`
- `POST /v1/subscriptions/:id/usage`
- `POST /v1/invoices/:id/retry`
