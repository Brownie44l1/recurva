# Nomba API — Subscription Billing Engine Knowledge Base

**Source:** developer.nomba.com (official documentation), fetched July 1, 2026
**Scope:** Everything required to build a production-ready recurring/subscription billing engine on top of Nomba's Checkout, Recurring Payments (tokenized cards), and Direct Debit APIs.
**Status:** Sections 1–9 and 11 are complete, sourced directly from Nomba's docs. Section 10 (Compliance Audit) is **pending** — no codebase was available in this session. See the note at the end of Section 10.

---

## 1. Authentication

### Mechanism
Nomba uses **OAuth 2.0 client-credentials grant**. There is no PKCE flow relevant to a server-side subscription engine (PKCE is mentioned in the API reference intro for client-side/browser use cases only). You exchange a `client_id` + `client_secret` for an `access_token` and `refresh_token`.

### Required credentials
| Credential | Where obtained | Notes |
|---|---|---|
| `client_id` | Nomba Dashboard → Developer → API Keys | Separate pair for sandbox and production |
| `client_secret` | Same as above | Never expose in frontend/public repos |
| `accountId` | Nomba Dashboard | Identifies the merchant account/sub-account; required as a header on almost every authenticated call, including the token issuance call itself |

### Token lifecycle
1. **Issue** — `POST /v1/auth/token/issue` with `grant_type: client_credentials`, `client_id`, `client_secret`. Returns `access_token`, `refresh_token`, `expiresAt`, `businessId`.
2. **Access tokens expire after 30 minutes.**
3. **Refresh** — `POST /v1/auth/token/refresh` with `grant_type: refresh_token` and the `refresh_token`. Nomba recommends refreshing **at least 5 minutes before expiry** rather than waiting for a 401.
4. **Revoke** — `POST /v1/auth/token/revoke` with `clientId` and `access_token`. Use when a token is compromised or no longer needed.

### Required headers (general pattern across the API)
- `Authorization: Bearer <access_token>` (note: the API Reference intro also mentions a legacy raw `Authorization: {access_token}` form without `Bearer` for some reference-doc examples — **all current guide examples use `Bearer <token>`; treat `Bearer` as the standard**)
- `Content-Type: application/json`
- `accountId: <accountId>` — required on nearly all endpoints, including token issuance/refresh
- `X-Idempotent-key: <uuid>` — optional but recommended on mutating requests (see Best Practices)

### Security considerations (per Nomba's own guidance)
- Never expose `client_id`, `client_secret`, or `refresh_token` in frontend code or public repos.
- Store tokens in secure backend storage (env vars, encrypted secrets store) — never client-side.
- Refresh proactively (5 min before expiry), don't wait for a 401.
- Revoke immediately if a token/credential is suspected leaked.
- Rotate credentials periodically; remove unused API keys.
- Webhook payloads must be signature-verified (see Section 4) to prevent spoofed payment confirmations — this is a security-critical control for a billing engine.

### Endpoint reference — Authentication
| Endpoint | Method | Purpose | Key headers | Body |
|---|---|---|---|---|
| `/v1/auth/token/issue` | POST | Obtain access + refresh token | `Content-Type`, `accountId` | `grant_type`, `client_id`, `client_secret` |
| `/v1/auth/token/refresh` | POST | Refresh expired/expiring token | `Authorization`, `Content-Type`, `accountId` | `grant_type: refresh_token`, `refresh_token` |
| `/v1/auth/token/revoke` | POST | Revoke a token | `Content-Type`, `accountId` | `clientId`, `access_token` |

---

## 2. Environment Configuration

### Base URLs
| Environment | Base URL | Credential pair |
|---|---|---|
| Production | `https://api.nomba.com` | Production `client_id`/`client_secret` |
| Sandbox | `https://sandbox.nomba.com` | Sandbox `client_id`/`client_secret` |

Both credential pairs are generated together on the dashboard but are **not interchangeable**: sandbox credentials only work against `sandbox.nomba.com`, production credentials only against `api.nomba.com`. Mixing them causes authentication errors.

### Required environment variables (recommended for your billing engine)
```
NOMBA_ENV=production|sandbox
NOMBA_BASE_URL=https://api.nomba.com   # or https://sandbox.nomba.com
NOMBA_CLIENT_ID=
NOMBA_CLIENT_SECRET=
NOMBA_ACCOUNT_ID=
NOMBA_WEBHOOK_SIGNING_SECRET=          # set when configuring the webhook URL on the dashboard
NOMBA_CALLBACK_URL=                    # your public checkout callback/redirect URL
NOMBA_WEBHOOK_URL=                     # your public webhook receiver URL (must be publicly reachable)
```

### Optional configuration
- `NOMBA_SUB_ACCOUNT_ID` — if crediting a sub-account rather than the parent account (`accountId` inside the `order` object of a checkout request).
- Split-payment configuration (`splitRequest`) if revenue needs to be divided across accounts at charge time.
- `allowedPaymentMethods` restriction list, if you want to constrain the hosted checkout page to card-only (required for reliable tokenization-based subscription renewals — see Section 5).

### Sandbox vs production configuration differences (config-relevant)
- **Sandbox checkout endpoints live under a different path prefix**: `/sandbox/checkout/...` instead of `/v1/checkout/...`. This is the single most common integration mistake — see below.
- Sandbox webhooks fire **synchronously** immediately after the test action (OTP approval, etc.); production webhooks are queued and delivered asynchronously with retries.
- `GET /v1/checkout/transaction` (rich transaction fetch) is **production-only**. Sandbox equivalent is `GET /sandbox/checkout/transaction`.
- Refund (`POST /v1/checkout/refund`) is documented as **production-only**; sandbox uses `POST /sandbox/checkout/refund`.
- Sandbox data is stored in Redis and **expires after 48 hours**; production data is permanent.
- Sandbox card/CVV/PIN/expiry values are not validated — only the card *number* determines the simulated outcome.

### Common configuration mistakes (explicit from docs + inference)
1. Using `/v1/checkout/...` paths against the sandbox base URL (or vice versa) — sandbox requires the `/sandbox/checkout/...` prefix.
2. Mixing sandbox credentials with the production base URL or vice versa.
3. Omitting the `accountId` header — required on almost every authenticated call, easy to forget since it's a custom header, not part of standard OAuth.
4. Treating a `200 OK` HTTP status as success without checking the `code` field in the JSON body — Nomba can return HTTP 200 with an error `code`.
5. Not configuring a **signature key** when setting up the webhook URL on the dashboard — this is technically optional but Nomba explicitly warns that skipping it exposes you to spoofed webhook attacks.
6. Sending `NGN` from a DRC-region account (must use `CDF`/`USD`) — results in `400 Bad Request`.
7. Letting the access token expire mid-batch-job (30-minute lifetime) without proactive refresh — causes cascading 401s in a subscription renewal batch run.

---

## 3. Payment Flow (Checkout — hosted, non-recurring leg)

Nomba's core payment primitive for the **first** payment in a subscription (before you have a token/mandate) is **Checkout** — a hosted payment page.

### Step-by-step lifecycle

**Step 1 — Create a checkout order**
- Endpoint: `POST /v1/checkout/order` (sandbox: `POST /sandbox/checkout/order`)
- Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `accountId: <accountId>`
- Body:
  ```json
  {
    "order": {
      "amount": "10000.00",
      "currency": "NGN",
      "orderReference": "uuid-v4-recommended",
      "callbackUrl": "https://merchant.com/callback",
      "customerEmail": "customer@example.com",
      "customerId": "your-internal-customer-id",
      "accountId": "sub-account-id-optional",
      "splitRequest": { "...": "..." },
      "orderMetaData": { "productName": "Premium Plan" },
      "allowedPaymentMethods": ["Card"]
    },
    "tokenizeCard": true
  }
  ```
- **Validation rules**: `amount` and `currency` required; `amount` is a **string**, not a number. `currency` must be an activated currency for the account (`NGN` default; `CDF`/`USD` for DRC; `USD`/`EUR`/`GBP` on request). DRC accounts **cannot** use `NGN` — rejected with 400. `orderReference` must be unique per merchant if supplied (recommend UUID v4); if omitted, Nomba generates one.
- **Response (success)**:
  ```json
  { "code": "00", "description": "Success", "data": { "checkoutLink": "...", "orderReference": "..." } }
  ```
- **Response (error, e.g. missing amount)**: `{ "code": "02", "description": "amount can not be null", "data": null }`
- For subscription billing: set **`tokenizeCard: true`** on the *first* checkout order for a customer so Nomba tokenizes the card for future recurring charges.

**Step 2 — Customer redirection**
- Redirect (or iframe) the customer to `data.checkoutLink`.
- Sandbox links contain a `/sandbox/` path segment distinguishing them from production links.
- Link stays active until payment completes or the order is explicitly cancelled.
- After payment (success or failure), Nomba redirects to `callbackUrl` with `orderReference` appended as a query param, e.g. `?orderReference=...`.

**Step 3 — Payment authorization (customer-side, on Nomba's hosted page)**
- Card flow: customer submits card details → possible OTP step (`T0` response) or 3DS redirect (`S0` response) → approval.
- Sandbox test cards:
  | Card Number | Network | Outcome |
  |---|---|---|
  | `5434621074252808` | Mastercard | OTP required |
  | `4000000000002503` | Visa | 3DS required |
  | `5484497218317651` | Mastercard | Declined ("do not honor") |
  - Sandbox OTP values: `9999` = approved, `1234` = timeout, `5464` = invalid OTP. PIN in sandbox: `1234`.

**Step 4 — Payment completion**
- On success, Nomba fires a `payment_success` webhook to your configured webhook URL, synchronously in sandbox, asynchronously (queued) in production.
- If `tokenizeCard: true` was set, the webhook payload includes a `tokenizedCardData` object with `tokenKey`, `cardType`, `cardPan`, expiry fields — **persist `tokenKey`**, it is the credential for all future recurring charges against this card.

**Step 5 — Payment verification (mandatory before delivering value)**
Two options:
| Endpoint | Method | Environment | Use case |
|---|---|---|---|
| `/v1/transactions/accounts/single?orderReference=...` or `?transactionRef=...` | GET | Sandbox + Production | Simple status check — `data.status === "SUCCESS"` |
| `/v1/checkout/transaction?idType=ORDER_REFERENCE&id=...` | GET | **Production only** | Rich order/transaction/card/transfer detail |
- Sandbox equivalent of the rich fetch: `GET /sandbox/checkout/transaction?idType=orderReference&id=...`.
- Sandbox has an additional debug endpoint: `POST /v1/transactions/accounts` (fetch by `transactionRef` body param) — works in sandbox specifically for scenario testing.
- **Nomba's explicit best practice: always verify via API even after receiving a webhook. Never give value on webhook alone.**

**Step 6 — Payment statuses**
- Response `data.status` values seen in docs: `SUCCESS`, `PENDING_BILLING` (transfers), `REFUND` (failed & auto-refunded), `PAYMENT_FAILED`.
- Response envelope `code` field: `"00"` = success; anything else = error/failure state (see Section 7).
- A `404`-style "not found" response for verification: `{ "code": "01", "description": "Transaction not found", "data": null }`.

**Step 7 — Failure scenarios**
- Declined card → `payment_failed` webhook event, `gatewayMessage` describes reason (e.g., "Insufficient Funds").
- OTP timeout / invalid OTP → payment does not complete; customer must retry within the checkout session.
- Order not found (sandbox test case): `orderReference: "1234567890"` deliberately returns `404` on all endpoints, for testing your error handling.

### Cancel vs Refund — distinct operations
| Operation | Endpoint | Applies to | Notes |
|---|---|---|---|
| Cancel | `POST /v1/checkout/order/cancel` (sandbox: `/sandbox/checkout/order/cancel` — inferred by prefix convention) | **Unpaid/pending** orders only | Body: `{ "orderReference": "..." }`. Cancelling an already-cancelled order errors — check `success` field. |
| Refund | `POST /v1/checkout/refund` (sandbox: `POST /sandbox/checkout/refund`) | **Completed/paid** transactions | **Production-only per docs**, though sandbox has a parallel endpoint for testing. Full refund (`transactionId` only), partial (`+ amount`), or transfer-based refund (`+ accountNumber + bankCode`) |

- Card refunds take **T+7 business days**; bank-transfer refunds are near-instant and are Nomba's recommended method for urgent refunds.
- Sandbox failed-refund test case: `transactionId: "WEB-ONLINE_C-97922-db88d4c3-a0af-4887-a089-b5d2e51b8f19"` always returns `code: "400"`.

### Retry behavior for API calls (payment flow)
Not explicitly documented per-endpoint beyond the general error-code table (Section 7). Nomba's own SDK examples do not show automatic client-side retry logic for checkout creation — treat `01` (generic error) as retryable and `02`/`05`/`06` as non-retryable per the Error Codes page.

---

## 4. Webhooks

### Registration
- Dashboard path: **Developer → Webhook Setup**. You set a **live URL**, a **test/sandbox URL**, and a **signature key** (signing secret) here.
- You must **explicitly subscribe** to each event type you want notifications for — subscription is not automatic/global.
- **The callback URL must be publicly reachable** (Nomba explicitly warns of this). For local dev, use a tunnel (e.g. ngrok) and register the tunnel URL.

### Supported event types
| Event | Trigger |
|---|---|
| `payment_success` | Payment successfully credited (card, virtual account, PayByTransfer) |
| `payout_success` | Successful debit from your account (transfer, bill payment) |
| `payment_failed` | A payment attempt failed |
| `payment_reversal` | A payment is reversed back to the customer |
| `payout_failed` | Payout failed to process |
| `payout_refund` | A payout was refunded back to your Nomba account |

(Note: the dashboard event list also shows an `order_success` event type in the webhook-events API sample — treat this as an additional/legacy event key to watch for defensively even though it's not in the primary "Supported Events" table.)

### Webhook request headers (all present on every delivery)
| Header | Description |
|---|---|
| `nomba-signature` | HMAC-SHA256 signature computed from the payload + your signing secret |
| `nomba-sig-value` | Same signature value (redundant field) |
| `nomba-signature-algorithm` | Always `HmacSHA256` |
| `nomba-signature-version` | Currently `1.0.0` |
| `nomba-timestamp` | RFC-3339 UTC timestamp of the send |

HTTP header names are case-insensitive — normalize casing before lookup.

### Payload structure
```json
{
  "event_type": "payment_success",
  "requestId": "uuid",
  "data": {
    "merchant": { "walletId": "...", "walletBalance": 0, "userId": "..." },
    "terminal": {},
    "transaction": { "transactionId": "...", "type": "...", "time": "...", "transactionAmount": 0, "responseCode": "", "..." : "..." },
    "customer": { "...": "..." },
    "order": { "orderReference": "...", "orderId": "...", "amount": 0, "currency": "...", "customerEmail": "...", "..." : "..." },
    "tokenizedCardData": { "tokenKey": "...", "cardType": "...", "cardPan": "...", "tokenExpiryMonth": "...", "tokenExpiryYear": "..." }
  }
}
```
`tokenizedCardData` is only present when `tokenizeCard: true` was set on order creation and the payment succeeded.

### Signature verification algorithm
The signature is **not** a simple HMAC over the raw JSON body. Nomba's own reference implementations (Go/Python/JS/Java/C#/PHP all provided in docs) construct a specific colon-delimited string and HMAC-SHA256 that:

```
hashingPayload = event_type + ":" + requestId + ":" + merchant.userId + ":" + merchant.walletId + ":" + transaction.transactionId + ":" + transaction.type + ":" + transaction.time + ":" + transaction.responseCode + ":" + nomba-timestamp-header-value
```
Then: `signature = base64(HMAC_SHA256(hashingPayload, signingSecret))`, compared (case-insensitively per the sample code) against the `nomba-signature` header value.

**Critical implementation notes:**
- If `transaction.responseCode` is the literal string `"null"`, treat it as an empty string when building the hashing string (all reference implementations do this normalization).
- The `nomba-timestamp` header value (not a value from the JSON body) is the final component of the hash input.
- This is a **custom, field-selective signature scheme** — not a signature over the full raw request body. You cannot verify it generically; you must parse the JSON, extract these specific fields, and reconstruct the string exactly as shown.

### Expected response from your server
Not explicitly spelled out as a payload contract, but the retry section states: **return a `2XX` status code** to acknowledge successful receipt. Anything else (4XX or 5XX) is treated as a failed delivery and triggers retry.

### Retry policy
- Triggered by any non-2XX response (both 4XX and 5XX).
- **Exponential backoff, up to 5 additional retries** (6 total attempts including the first):

| Retry # | Wait time |
|---|---|
| 1 | 120s (~2 min) |
| 2 | 280s (~5 min) |
| 3 | 640s (~11 min) |
| 4 | 1440s (~24 min) |
| 5 | 3200s (~53 min) |

- Total window from first attempt to final retry: roughly 96 minutes.

### Delivery guarantees / debugging tools
- **Event Logs API**: `POST /v1/webhooks/event-logs` — query delivered events by `coreUserId`, `eventType`, date range. Returns `responseHttpStatus`, `responsePayload`, `hookRequestId`.
- **Single Repush**: `POST /v1/webhooks/re-push` with `hooksRequestId` — manually re-trigger one event.
- **Bulk Repush**: `POST /v1/webhooks/bulk-re-push` with `hooksRequestIds` array.
- **Webhook Events list**: `POST /v1/webhooks/events` — list configured webhook subscriptions (`webHookId`, `eventURL`, `eventType`, `enabled`).
- **Webhook Replay**: `POST /v1/webhooks/replay` — bulk re-trigger by date range + status filter + event type filter. Replay eligibility by log status:

| Status | Replay Allowed | Meaning |
|---|---|---|
| `INITIATED` | Yes (safe) | Logged but delivery never completed |
| `FAILED` | Yes (safe) | Non-2xx response received |
| `INCONCLUSIVE` | Yes, with caution | Unknown outcome — no response heard |
| `PUSHED` | Yes, only if needed | Already delivered successfully — replaying risks duplicate processing |

- Nomba explicitly recommends **idempotency handling on your webhook endpoint**, especially given `INCONCLUSIVE`/`PUSHED` replay risk.
- Dashboard equivalent: **Developer → Webhook Repush**.

### Sandbox limitations
- Sandbox webhooks fire **synchronously**, immediately after the triggering action (OTP approval or transfer confirmation) — no retry/backoff behavior to test in sandbox in the same way as production (since delivery is not queued the same way).
- Both sandbox and production webhooks carry the same signature headers, so signature-verification logic can and should be tested in sandbox.

### Production behavior
- Delivery is **queued**, i.e., asynchronous relative to the triggering transaction — expect webhook arrival to lag slightly behind the payment event, and never block your API-facing checkout-completion logic waiting on it.

---

## 5. Subscription/Recurring Billing Support

**Nomba does not have a native "subscription" or "billing plan" object/engine** (no `POST /subscriptions`, no plan/price catalog, no automatic billing-cycle scheduler). Recurring billing must be **orchestrated entirely by your application**, using one of two Nomba primitives as the underlying charge mechanism:

### Option A: Tokenized Card Recurring Payments (card-based)
This is Nomba's own recommended pattern for "recurring or subscription payments" (per the Recurring Payments doc).

**Lifecycle:**
1. **Enrollment / first charge**: Create a checkout order with `tokenizeCard: true`. Customer completes payment via the hosted checkout page (Section 3).
2. **Token capture**: On `payment_success` webhook, extract `data.tokenizedCardData.tokenKey` (plus `cardType`, `cardPan`, expiry) and persist it against your internal customer/subscription record.
3. **Renewal charge**: For each billing cycle, your engine calls:
   - `POST /v1/checkout/tokenized-card-payment`
   - Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `accountId: <accountId>`
   - Body:
     ```json
     {
       "order": {
         "orderReference": "new-unique-ref-per-cycle",
         "customerId": "762878332454",
         "callbackUrl": "https://merchant.com/callback",
         "customerEmail": "customer@example.com",
         "amount": "10000.00",
         "currency": "NGN",
         "accountId": "optional-subaccount",
         "splitRequest": { "...": "..." }
       },
       "tokenKey": "the-saved-token"
     }
     ```
   - Response: `{ "code": "00", "description": "Success", "data": { "status": true, "message": "Approved by Financial Insitution" } }` (note: "Insitution" is Nomba's actual typo in the API response, not a documentation error — do not "fix" this string in tests/parsers).
4. **Verification**: Nomba explicitly instructs to verify every tokenized charge via `/v1/transactions/accounts/single` (or webhook) before granting continued access — same verification discipline as a normal checkout.
5. **Renewal failure**: No documented automatic retry mechanism on Nomba's side for a failed tokenized charge — your billing engine must implement its own dunning/retry schedule (see Section 9, and analogous behavior in Nomba's own WooCommerce plugin: failed auto-renewal → subscription placed **on-hold** until the customer manually pays).
6. **Cancellation**: There is no "cancel subscription" endpoint because there is no subscription object — cancellation is purely an application-level state change (stop calling the tokenized-charge endpoint). You may also proactively `DELETE`/expire the stored token via `DELETE /v1/checkout/tokenized-cards/{id}` type endpoint (see API Reference: "Delete tokenized card data") if you want to hard-revoke charge capability.
7. **Token management endpoints**:
   - `GET` List Tokenized Cards — `/nomba-api-reference/online-checkout/list-tokenized-cards`
   - `PUT`/similar Update Tokenized Card — keep card valid (e.g., updated expiry) for continued billing
   - `DELETE` Delete tokenized card data — revoke a token
   - `POST` Charge tokenized card — `/v1/checkout/tokenized-card-payment` (the renewal call)

**Important constraint (from Nomba's own WooCommerce plugin documentation, applicable conceptually)**: only **card** payment methods support unattended/automatic recurring renewal. Payment methods like USSD, bank transfer, and QR are one-time/customer-present methods and **cannot** be silently re-triggered — a subscription funded by those methods must fall back to "customer must log in and pay manually" when renewal is due. If your billing engine wants fully automated recurring charges, **restrict enrollment checkout to `allowedPaymentMethods: ["Card"]`**.

**Free trial edge case (documented in the WooCommerce plugin, generalizable)**: if a subscription has a free trial and zero signup fee, there is no card transaction to tokenize during trial, so automatic renewal is not possible for the very first billed cycle — the first post-trial charge requires the customer to be present, after which normal tokenized auto-renewal can proceed.

### Option B: Direct Debit Mandates (bank-account-based)
This is Nomba's actual purpose-built recurring/subscription primitive at the bank-account level (NIBSS e-mandate), and is arguably closer to a "true" subscription engine than card tokenization.

**Lifecycle:**
1. **Create mandate** — `POST /v1/direct-debits`
   - Body includes `customerAccountNumber`, `bankCode`, `customerName`, `customerAddress`, `customerAccountName`, `frequency`, `customerPhoneNumber`, `merchantReference` (numeric string only), `startDate`, `endDate`, `customerEmail`, `startImmediately`.
   - `frequency` enum: `VARIABLE`, `WEEKLY`, `MONTHLY`, `QUARTERLY`, `EVERY_TWO_MONTHS` ... `EVERY_TWELVE_MONTHS` (i.e. every N months, 2–12, plus weekly/monthly/quarterly named values).
   - Response returns `mandateId` and an authentication instruction: the customer must transfer **₦50** to a NIBSS-provided account, **from the exact account number tied to the mandate**, to authenticate/activate it.
2. **Mandate verification** — bank-side validation can take **up to 72 hours**.
3. **Check status** — `GET /v1/direct-debits/status?mandateId={id}`. `mandateStatus`: `ACTIVE`, `SUSPENDED`, `DELETED` (also seen: `SUSPEND` as a set-value in update responses — inconsistent casing/tense across docs, flag as an unknown, see Section 11). `mandateAdviceStatus`: `ADVICE_SENT` / `ADVICE_NOT_SENT` — **both `ACTIVE` status AND `ADVICE_SENT` advice status are required before you can debit**.
4. **Debit (renewal charge)** — despite doc text saying "send a GET request," the code sample is actually `POST /v1/direct-debits/debit-mandate` with body `{ "mandateId": "...", "amount": "110.00" }`. (This GET/POST mismatch in the docs is flagged in Section 11 — trust the code sample, not the prose.)
5. **Get single mandate** — `GET /v1/direct-debits/<mandateId>` (path param, not query param — inconsistent with the status-check endpoint which uses a query param; verify against OpenAPI spec).
6. **List mandates** — `GET /v1/direct-debits/mandates?page=0&pageSize=20` — standard page/pageSize/totalItems/totalPages/hasMore pagination shape (distinct from the cursor pagination used elsewhere in the API — see Section 11 for this inconsistency).
7. **Cancellation / suspension** — `PUT /v1/direct-debits/update-status` with `{ "mandateId": "...", "status": "SUSPEND" }`. This is your subscription cancellation/pause mechanism for Direct-Debit–funded subscriptions.
8. **Failed renewals** — no documented automatic retry from Nomba's side for a failed `debit-mandate` call; your billing engine owns the retry/dunning schedule, gated by re-checking mandate status/advice status before each retry.

### Recommended architecture for a production subscription engine
Given neither primitive is a full subscription engine, your billing engine should own:
- **Plan/price catalog** (not provided by Nomba)
- **Subscription state machine**: `trialing → active → past_due → canceled/expired`, mapped to your own DB, driven by scheduled jobs, not by Nomba callbacks
- **Billing-cycle scheduler** (cron/queue) that, per due subscription, calls either the tokenized-card-payment endpoint or the direct-debit debit-mandate endpoint
- **Dunning/retry logic** with your own backoff schedule on renewal failure (Nomba gives none)
- **Idempotency**: generate a fresh `orderReference`/`merchantReference` per billing cycle attempt, but reuse the **same idempotency key** (`X-Idempotent-key`) only within retries of the *same* attempt, not across cycles
- **Reconciliation**: periodic Transaction/Requery API polling as a safety net against missed or delayed webhooks (see Section 6 endpoints `Fetch a single transaction`, `Transaction Requery`)
- **Token/mandate expiry handling**: cards expire; mandates have `endDate` — your engine must detect and re-prompt the customer for re-authorization before the underlying charge instrument lapses

---

## 6. API Reference Summary (endpoints relevant to a subscription billing engine)

### Auth
| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/v1/auth/token/issue` | POST | Get access/refresh token | client credentials in body |
| `/v1/auth/token/refresh` | POST | Refresh token | Bearer + refresh_token |
| `/v1/auth/token/revoke` | POST | Revoke token | clientId + access_token in body |

### Checkout / Payments
| Endpoint | Method | Purpose | Errors seen |
|---|---|---|---|
| `/v1/checkout/order` (sandbox: `/sandbox/checkout/order`) | POST | Create hosted checkout order | `02` validation (e.g. null amount) |
| `/v1/checkout/order/cancel` | POST | Cancel unpaid order | `01` generic error if already paid/cancelled |
| `/v1/checkout/refund` (sandbox: `/sandbox/checkout/refund`) | POST | Full/partial/transfer refund | Production-only (docs); `400` on simulated failure |
| `/v1/checkout/tokenized-card-payment` | POST | Charge a saved card (recurring charge) | Card decline messages in `data.message` |
| `/v1/checkout/transaction` (sandbox: `/sandbox/checkout/transaction`) | GET | Rich transaction/order detail | Production-only per docs |
| `/v1/transactions/accounts/single` | GET | Lightweight status check by `orderReference`/`transactionRef` | `01` "Transaction not found" |
| `/v1/transactions/accounts` | POST | Sandbox-only transaction fetch by `transactionRef` | — |

### Tokenized cards
| Endpoint | Method | Purpose |
|---|---|---|
| List tokenized cards | GET | Retrieve all saved cards for a customer |
| Update tokenized card data | PUT | Update saved card metadata |
| Delete tokenized card data | DELETE | Revoke a saved card token |
| Request OTP before saving a card | POST | Pre-save authentication step |
| Submit user OTP | POST | Confirms card save |
| Get user saved cards | POST/GET | Retrieve cards after OTP auth |

### Direct Debit
| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/direct-debits` | POST | Create mandate |
| `/v1/direct-debits/status?mandateId=` | GET | Check mandate + advice status |
| `/v1/direct-debits/debit-mandate` | POST | Debit an active mandate (recurring charge) |
| `/v1/direct-debits/<mandateId>` | GET | Fetch single mandate |
| `/v1/direct-debits/mandates?page=&pageSize=` | GET | List mandates (page-based pagination) |
| `/v1/direct-debits/update-status` | PUT | Suspend/activate/cancel a mandate |

### Webhooks (management/debug)
| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/webhooks/event-logs` | POST | Query delivery logs |
| `/v1/webhooks/re-push` | POST | Re-trigger a single event |
| `/v1/webhooks/bulk-re-push` | POST | Re-trigger multiple events |
| `/v1/webhooks/events` | POST | List configured webhook subscriptions |
| `/v1/webhooks/replay` | POST | Bulk replay by date range/status/type filter |

### Transactions (reconciliation/requery)
| Endpoint | Method | Purpose |
|---|---|---|
| Fetch a single transaction (parent/sub account) | GET | Direct lookup by transaction ID |
| Transaction Requery (`transaction-requery`, by `sessionId`) | — | Confirm status when uncertain |
| Filter parent/sub account transactions | GET/POST | Search transactions, e.g. by `merchantTxRef` |
| Fetch transactions (parent/sub account) | GET | Cursor-paginated transaction list |

All endpoints above require `Authorization: Bearer <token>`, `accountId`, and `Content-Type: application/json` (for POST/PUT) unless otherwise noted.

---

## 7. Error Handling

### Response envelope
Every response: `{ "code": "...", "description": "...", "data": {...} | null }`. **A `200` HTTP status does not guarantee success — always check `code`.**

### HTTP status codes
| Status | Meaning |
|---|---|
| 200 | Request processed — check `code` |
| 400 | Bad request — invalid payload/missing fields |
| 401 | Unauthorized — missing/expired token |
| 403 | Forbidden — insufficient permissions |
| 404 | Resource not found |
| 422 | Unprocessable entity — validation error |
| 429 | Rate limit exceeded |
| 500 | Internal server error — retry with backoff |

### Application-level `code` values
| Code | Meaning | Retryable |
|---|---|---|
| `00` | Success | — |
| `01` | Generic error (also: "invalid credentials" in auth context) | Yes |
| `02` | Validation error | No |
| `05` | Transaction not permitted | No |
| `06` | Error — do not retry | No |
| `401` (as a code, distinct from HTTP status) | Unauthorized | Re-authenticate |

### Transfer-specific `data.status` values (not general error codes, but analogous state signals)
| Status | Meaning | Action |
|---|---|---|
| `SUCCESS` | Completed immediately | None |
| `PENDING_BILLING` | Processing | Poll/await webhook |
| `REFUND` | Failed, auto-refunded | Safe to retry |

### Recommended handling pattern (Nomba's own sample code)
```
if code !== '00': raise/throw with code+description
if data.status === 'PENDING_BILLING': await webhook or poll by id
if data.status === 'REFUND': safe to retry
```

### Rate-limit errors
`429` with `{ "code": "429", "description": "Too many requests. Please slow down." }`. Special case: **max 5 bank transfers to the same recipient per minute** (not directly relevant to card/mandate-based subscription charges, but relevant if refunding via bank transfer at volume).

### Retryable vs non-retryable summary
- **Retryable**: `01` generic error, `429` (after backoff), `500` (after backoff), `PENDING_BILLING`/`REFUND` transfer states.
- **Non-retryable**: `02` validation error (fix the request), `05` transaction not permitted, `06` explicit do-not-retry, `400`/`403`/`404`/`422` (fix the request or permissions before retrying).

---

## 8. Sandbox vs Production — Full Difference Matrix

| Feature | Sandbox | Production |
|---|---|---|
| Base URL | `https://sandbox.nomba.com` | `https://api.nomba.com` |
| Checkout path prefix | `/sandbox/checkout/...` | `/v1/checkout/...` |
| Create order | ✅ | ✅ |
| Card payment | ✅ test cards only, unvalidated CVV/expiry/PIN | ✅ real cards |
| Bank transfer | ✅ simulated | ✅ real |
| 3DS | ✅ simulated | ✅ real |
| Webhooks | ✅ fire **synchronously** | ✅ **queued**, async, with retry/backoff |
| Rich transaction fetch | `GET /sandbox/checkout/transaction` | `GET /v1/checkout/transaction` (**prod-only** endpoint path) |
| Refund | `POST /sandbox/checkout/refund` | `POST /v1/checkout/refund` (**prod-only** per docs) |
| Cancel order | ✅ | ✅ |
| Tokenized cards | ✅ hardcoded mock data | ✅ real tokens |
| Data persistence | Redis, **48-hour expiry** | Permanent |
| Credentials | Separate sandbox `client_id`/`client_secret`, not interchangeable with prod | Separate prod credentials |
| No-auth "Try the API" mode | Available for select endpoints (Transfer, Virtual Account, Checkout) with **no bearer token / no accountId** at all | Not applicable |

### Known sandbox-specific test fixtures
- Card declines: `5484497218317651`
- OTP timeout: `1234`; invalid OTP: `5464`; approved OTP: `9999`
- Forced 404: `orderReference: "1234567890"`
- Forced failed refund: `transactionId: "WEB-ONLINE_C-97922-db88d4c3-a0af-4887-a089-b5d2e51b8f19"`
- Forced failed tokenized-card fetch: `customerEmail: "test@test.com"`

---

## 9. Best Practices (Nomba's own recommendations)

**Security**
- Never expose credentials client-side.
- Configure a webhook signing key (technically optional, strongly urged) to prevent spoofed/MITM webhook attacks.
- Rotate/revoke credentials proactively.

**Idempotency**
- Use `X-Idempotent-key` header (any unique value, UUID recommended) on mutating calls (explicitly called out for Bank Transfer, but described as broadly applicable). Same key + same payload → same result returned, no duplicate side effect. Same key + different payload → error.
- Nomba states it "already handles idempotency internally" but still recommends client-supplied keys as defense-in-depth.
- Explicitly recommended again for webhook **replay** handling (`INCONCLUSIVE`/`PUSHED` events) — your webhook receiver must itself be idempotent since replays can re-deliver already-processed events.

**Logging**
- No explicit "you must log X" requirement in the docs, but the entire Webhook Debug tooling (event-logs, repush, replay) implies you should keep your own correlation between `requestId`/`hookRequestId`/`orderReference`/`transactionId` to reconcile against Nomba's logs during incident response.

**Retry strategies**
- Client-side: not explicitly prescribed beyond "retry `01`/`429`/`500` with backoff" (inferred from the error-code retryability table).
- Server-side (Nomba → you): exponential backoff, 5 retries, ~2 min → ~53 min spacing (Section 4).

**Performance**
- Respect the fixed-window rate limit: default **15 POST requests / 1000ms window** and unspecified default for non-POST (elevated/low-traffic tiers have different limits — contact Nomba to be reclassified if you expect high subscription-renewal batch volume).
- Response headers `X-Rate-Limit-Limit`, `X-Rate-Limit-Remaining`, `X-Rate-Limit-Window` should be read and used to self-throttle, especially important for a subscription engine that may fire many renewal charges in a short batch window.
- Cache static reference data (e.g., bank codes) — Nomba explicitly says "cache this response, bank codes rarely change."

**Reliability**
- Always verify transactions via API, never trust webhook delivery alone.
- Use Transaction Requery / Fetch endpoints as a reconciliation safety net against missed webhooks.
- For batch renewal jobs: refresh the access token proactively before a long-running batch exceeds the 30-minute token lifetime.

---

## 10. Compliance Audit — Specification vs. Current Implementation

**This section could not be completed in this session.** No codebase, repository, or implementation files were provided or found in the working environment (`/mnt/user-data/uploads` was empty and no repo was accessible).

To complete this section, please provide **one** of the following:
1. Upload the relevant source files (auth/token handling, checkout/order creation, webhook receiver/signature verification, subscription/billing scheduler, error-handling wrappers, and environment/config files) via the file upload feature, or
2. Point me to a Git repository URL I can fetch (public GitHub repos are reachable from this environment via `github.com`/`raw.githubusercontent.com`), or
3. Paste the relevant code directly into the conversation.

Once I have the code, I will audit it against every requirement documented above and produce a table with, for each deviation:
- **Specification requirement** (quoting the relevant section above)
- **Current implementation behavior**
- **Category** (missing functionality / incorrect assumption / config issue / request-response mismatch / missing header / webhook handling issue / auth problem / error-handling gap)
- **Severity**: Critical / High / Medium / Low, using this rubric:
  - **Critical** — money-safety issue (double-charging, missing signature verification, giving value without verification, storing raw card data instead of tokens)
  - **High** — breaks core flow in production (wrong base URL/path prefix per environment, missing required header causing systemic 401/400s, no reconciliation against missed webhooks)
  - **Medium** — degrades reliability/observability but has a workaround (no idempotency keys, no retry/backoff on renewal failures, no dunning logic)
  - **Low** — cosmetic/non-blocking (inconsistent logging, minor field-naming mismatches with no functional impact)

---

## 11. Questions for Nomba Support

These are points where the documentation is internally inconsistent, incomplete, or where I am not ≥90% confident in the correct behavior. Each is written to be pasted directly to Nomba's support chatbot.

1. **Direct Debit — GET vs POST for debit-mandate.** The "Debit Mandate" section of your docs says "send a GET request" to `/v1/direct-debits/debit-mandate`, but the code sample shows `curl --request POST`. Which is correct — GET or POST — for debiting an active mandate?

2. **Direct Debit — mandate status casing.** `GET /v1/direct-debits/status` returns `mandateStatus: "Active"` (title case) in one example, while the "Check Mandate Status" prose says possible values are `ACTIVE`, `SUSPENDED`, `DELETED` (upper case), and the Update Status endpoint sets `status: "SUSPEND"` (no trailing D). Please confirm the exact, case-sensitive enum values returned by `GET status` vs. accepted by `PUT update-status` for `/v1/direct-debits`.

3. **Direct Debit — single mandate fetch path.** "GET MANDATE" section shows `GET /v1/direct-debits/<mandateId>` (path parameter), while "Check Mandate Status" uses `GET /v1/direct-debits/status?mandateId={mandateId}` (query parameter). Are both endpoints valid and distinct, or is one deprecated? What's the functional difference in the returned payload?

4. **Recurring tokenized charge — synchronous failure vs webhook.** For `POST /v1/checkout/tokenized-card-payment`, does a declined card return `data.status: false` synchronously in the HTTP response, or only via a `payment_failed` webhook (or both)? The docs only show a success example.

5. **Token expiry/rotation.** Is there a way to detect that a `tokenKey` from card tokenization has expired (e.g., card expiry passed) before attempting a charge, other than a failed charge attempt? Is there a webhook event for token expiration?

6. **Webhook event for Direct Debit outcomes.** The Webhooks page lists `payment_success`, `payout_success`, `payment_failed`, `payment_reversal`, `payout_failed`, `payout_refund`. Does a Direct Debit mandate debit (`/v1/direct-debits/debit-mandate`) trigger any of these events, a distinct mandate-specific event, or no webhook at all?

7. **Idempotency key scope.** Is the `X-Idempotent-key` header enforced (deduplicated) per-endpoint, per-account, or globally across the whole API? And what is the deduplication retention window (how long is a given key remembered)?

8. **Rate limit tier for subscription batch jobs.** For a merchant running scheduled recurring-charge batches (potentially many `tokenized-card-payment` or `debit-mandate` calls in a short window), what's the process and lead time to be classified as an "ELEVATED" account, and what are the actual elevated limits in requests/second today?

9. **`Authorization` header format.** The API Reference introduction page shows the header as `Authorization: {access_token}` (no `Bearer` prefix), while every guide and code sample uses `Authorization: Bearer <token>`. Is the non-Bearer form a legacy/alternate format that's still accepted, or is that a documentation error?
