# Recurva Integration Quickstart

Get from zero to your first paid subscription in ~10 minutes.

## Prerequisites

- A running Recurva instance (`docker compose up`) or access to `https://api.recurva.xyz` (production) or `https://dev.recurva.xyz` (staging)
- `curl` (or any HTTP client)

## Step 1: Register a Tenant

```bash
curl -X POST https://api.recurva.xyz/v1/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My SaaS Company",
    "email": "admin@mycompany.com",
    "password": "your-admin-password"
  }'
```

Save the `apiKey` from the response — you'll use it for all subsequent requests. The `password` is optional but enables dashboard login.

**Response:**
```json
{
  "tenant": { "id": "uuid", "name": "My SaaS Company", "email": "admin@mycompany.com" },
  "apiKey": "rcv_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
}
```

## Step 2: Create a Plan

```bash
curl -X POST https://api.recurva.xyz/v1/plans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer rcv_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" \
  -d '{
    "name": "Professional",
    "description": "Monthly subscription",
    "billingType": "fixed",
    "interval": "month",
    "prices": [
      { "currency": "NGN", "amount": 500000 }
    ]
  }'
```

Save the `plan.id` from the response.

## Step 3: Create a Customer

```bash
curl -X POST https://api.recurva.xyz/v1/customers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer rcv_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "currency": "NGN"
  }'
```

Save the `customer.id` from the response.

## Step 4: Create a Subscription

If the customer has a saved payment method:

```bash
curl -X POST https://api.recurva.xyz/v1/subscriptions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer rcv_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" \
  -d '{
    "customerId": "<customer-id>",
    "planId": "<plan-id>",
    "currency": "NGN",
    "paymentMethodId": "<payment-method-id>"
  }'
```

If no payment method is saved yet, omit `paymentMethodId`. The subscription will be created in `incomplete` status, and the response includes a `checkoutUrl` to collect the customer's card:

```json
{
  "subscription": { "id": "uuid", "status": "incomplete", ... },
  "checkoutUrl": "https://nomba.com/checkout/ref_abc123"
}
```

Redirect the customer to the `checkoutUrl`. After they complete payment, Nomba sends a callback that captures the card token and activates the subscription.

## Step 5: Verify the Subscription

```bash
curl -X GET https://api.recurva.xyz/v1/subscriptions/<subscription-id> \
  -H "Authorization: Bearer rcv_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
```

## Step 6: Set Up Webhook Endpoints (Optional)

To receive outbound events:

```bash
curl -X POST https://api.recurva.xyz/v1/webhooks/endpoints \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer rcv_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" \
  -d '{
    "url": "https://myapp.com/webhooks/recurva",
    "eventTypes": ["subscription.created", "subscription.cancelled", "invoice.paid"]
  }'
```

## Next Steps

- [API Reference](api-reference.md) — full endpoint documentation
- [Webhook Event Catalog](api-reference.md#outbound-webhook-events) — all outbound event payloads
- `docs/recurva.postman_collection.json` — import into Postman for interactive testing
