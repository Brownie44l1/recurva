# Nomba Integration & Onboarding Guide — Recurva

This document serves as the single source of truth for how Recurva integrates with Nomba's APIs, scopes tenant sub-accounts, verifies signatures, and runs local/production workflows.

---

## 1. Credentials & Account Structure

Recurva uses a parent-child account architecture to manage multi-tenant billing. The parent account authenticates all requests, while transactions are scoped to our dedicated sub-account.

| Credentials / Identifiers | Value | Scope & Usage |
| :--- | :--- | :--- |
| **Parent (Main) Account ID** | `f666ef9b-888e-4799-85ce-acb505b28023` | Passed in the `accountId` header on **every** Nomba API request. |
| **Our Sub-Account ID** | `e0e5cbae-79a3-40ce-8856-2576506a4ef4` | Passed in URL path segments, URL query parameters, or payload fields on all fund-moving endpoints (e.g. Virtual Accounts, Checkout, Transfers). |
| **TEST Client ID** | `706df6c4-b8bb-4130-88c4-d21b052f8631` | Authentication client ID used when `NOMBA_ENV=test`. |
| **TEST Private Key** | *(Stored in server `.env` only)* | Authentication secret/private key used when `NOMBA_ENV=test`. |
| **LIVE Client ID** | `e5e85b13-f560-4643-814e-c87435dbbc15` | Authentication client ID used when `NOMBA_ENV=live`. |
| **LIVE Private Key** | *(Stored in server `.env` only)* | Authentication secret/private key used when `NOMBA_ENV=live`. |
| **Inbound Webhook Signing Key** | `NombaHackathon2026` | Used to verify the `nomba-signature` header on incoming payloads from Nomba. |

> [!CAUTION]
> **Never commit private keys or webhook signing secrets to git.** They must only be stored in your environment configurations (e.g., local `.env` or `/opt/recurva/.env` on servers).

---

## 2. Environment Configuration

### Required Environment Variables
Add these to your local `.env` file. Do not mix test and live credential pairs:

```bash
# Nomba Environment Config ("test" | "live")
NOMBA_ENV=test

# Main Account Identifiers
NOMBA_PARENT_ACCOUNT_ID=f666ef9b-888e-4799-85ce-acb505b28023
NOMBA_SUB_ACCOUNT_ID=e0e5cbae-79a3-40ce-8856-2576506a4ef4

# Sandbox Credentials
NOMBA_TEST_CLIENT_ID=706df6c4-b8bb-4130-88c4-d21b052f8631
NOMBA_TEST_PRIVATE_KEY=your_test_private_key_here

# Live/Production Credentials (do not set locally)
NOMBA_LIVE_CLIENT_ID=e5e85b13-f560-4643-814e-c87435dbbc15
NOMBA_LIVE_PRIVATE_KEY=your_live_private_key_here

# Webhook Verification Secret
NOMBA_INBOUND_WEBHOOK_SECRET=NombaHackathon2026
```

> [!NOTE]
> `NOMBA_INBOUND_WEBHOOK_SECRET` is used strictly to verify signatures on events Nomba sends *inward* to Recurva. This is distinct from the per-tenant `webhook_secret` used to sign webhooks Recurva dispatches *outward* to tenant applications.

---

## 3. Base URL & Client Authentication Logic

Nomba determines the target environment based on the API credentials and hostname used. Crossing live credentials with sandbox hosts will result in a `403 Forbidden` error.

| Environment (`NOMBA_ENV`) | Base URL | Client Credentials to Use |
| :--- | :--- | :--- |
| **test** | `https://sandbox.nomba.com` | `NOMBA_TEST_CLIENT_ID` & `NOMBA_TEST_PRIVATE_KEY` |
| **live** | `https://api.nomba.com` | `NOMBA_LIVE_CLIENT_ID` & `NOMBA_LIVE_PRIVATE_KEY` |

### Authentication Pattern
1. **Fetch Access Token**: Nomba uses OAuth 2.0. Issue a `POST` request to `/v1/auth/token/issue` using the parent `accountId` header, passing the client credentials to receive a short-lived Bearer token.
2. **Execute Requests**: Attach the retrieved token to the `Authorization` header (`Bearer <token>`) and continue sending the parent `accountId` in the request headers.
3. **Scoping**: Include the `NOMBA_SUB_ACCOUNT_ID` in the request parameters or request payload for any endpoint that touches funds (e.g. `/v1/accounts/virtual/{subAccountId}`).

---

## 4. Inbound Webhook Integration

### 1. Manual Webhook Registration
Nomba does not support self-service webhook registration through a dashboard for this hackathon program. You must manually submit your endpoint URL using the Google Form provided in the credentials email.
* **Payload requirements**: Include your Sub-Account ID (`e0e5cbae-79a3-40ce-8856-2576506a4ef4`) and public HTTPS webhook URL.

### 2. URL Requirements
* **Reachability**: The URL must be publicly accessible over HTTPS (e.g., `https://api.recurva.xyz/webhooks/nomba`). Local routes (e.g., `localhost`) will not work.
* **Local Development Tunnels**: For local E2E testing, use a tunneling solution (like `ngrok`, `zrok`, or `localtunnel`) to forward incoming public traffic to your local server port (e.g., `http://localhost:3000`).

### 3. Signature Verification Algorithm
Verify the `nomba-signature` header on incoming payloads to ensure authenticity:
```ts
import * as crypto from 'crypto';

function verifyNombaSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

### 4. Required Inbound Events
Recurva responds to the following events sent by Nomba:
* `checkout.completed`: Persists the payment token and activates the corresponding subscription.
* `charge.success`: Marks invoices as `paid` and schedules/emits outbound notifications.
* `charge.failed`: Enters the dunning flow and retries payments according to local dunning schedules.

---

## 5. Troubleshooting & Common Failures

### `403 Forbidden` on Sub-Account Requests
* **Root Cause**: Passing the sub-account ID in the authorization header.
* **Fix**: Ensure the `accountId` header is always set to the **parent account ID**. Only pass the sub-account ID within the URL path or payload body.

### `403 Forbidden` on All Requests
* **Root Cause**: Mixing environments (e.g. live credentials against the sandbox base URL).
* **Fix**: Double-check that your client configuration correctly matches `test` with `https://sandbox.nomba.com` and `live` with `https://api.nomba.com`.

### `401 Unauthorized` on Webhooks
* **Root Cause**: Verification code transcription error (e.g., trying to parse JSON before verifying).
* **Fix**: Always verify signatures against the **raw, unparsed request body**.

### Webhook Events Never Arriving
* **Root Cause**: Webhooks **do not fire** in the Nomba Sandbox environment. 
* **Fix**: Real webhook events are only dispatched in the Live/Production environment. For local sandbox testing, mock incoming webhooks using curl or Postman payloads.

### Funds Land in the Wrong Account
* **Root Cause**: Virtual account created without specifying `subAccountId` scoping.
* **Fix**: Ensure virtual account paths match `/v1/accounts/virtual/{subAccountId}` to route funds to the sub-account instead of the shared parent account.