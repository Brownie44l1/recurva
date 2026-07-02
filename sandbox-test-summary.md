# Nomba Sandbox Test Summary

## Summary Table

| Question | Status | Answer Found | Evidence |
|----------|--------|-------------|----------|
| **Q1** — Debit-mandate GET vs POST | **Not testable** — account lacks DD sandbox access | Still needs Nomba support. Both GET and POST to `/v1/direct-debits/debit-mandate` return identical 404. All 22 Direct Debit path variants tested returned 404. | Log entries #21–#23 |
| **Q2** — Mandate status casing | **Not testable** — account lacks DD sandbox access | Still needs Nomba support. Could not observe `mandateStatus` field value or test SUSPEND round-trip. | Log entries #24–#27 |
| **Q3** — Single mandate fetch path vs status endpoint | **Not testable** — account lacks DD sandbox access | Still needs Nomba support. Both `GET /v1/direct-debits/<id>` and `GET /v1/direct-debits/status?mandateId=<id>` return identical 404. Cannot distinguish payloads. | Log entries #28–#30 |
| **Q4** — Tokenized charge decline behavior | **Confirmed** (with caveat) | Sandbox `POST /v1/checkout/tokenized-card-payment` always returns `{ "code": "00", "data": { "status": true } }` synchronously, regardless of token validity. Sandbox does not simulate tokenized-card declines. The payload includes `data.status: true` synchronously in the HTTP response. No `payment_failed` webhook fires because sandbox doesn't process actual declines for tokenized charges. | Log entries #31–#34 |
| **Q5** — Token expiry detection | **Not testable** in sandbox | Sandbox accepts any tokenKey including `"expired_2020"` and returns success. Token management endpoints (`/v1/checkout/tokenized-cards`, etc.) return 404. Cannot test token expiry detection empirically — needs production testing or Nomba clarification. | Log entries #35–#37 |
| **Q6** — Webhook event for Direct Debit outcomes | **Not testable** — account lacks DD sandbox access | Still needs Nomba support. No webhook events received on webhook.site (0 events total during test window). No actual debit was attempted (404 for DD endpoints). | Log entries #38–#39 |
| **Q7** — Idempotency key scope | **Not tested per instructions** | Still needs Nomba support | N/A |
| **Q8** — Rate limit tier | **Not tested per instructions** | Still needs Nomba support | N/A |
| **Q9** — Authorization header format | **Confirmed** | Both `Authorization: Bearer <token>` AND `Authorization: <token>` (no Bearer prefix) are accepted. Both returned `code: "00"` with successful checkout order creation. The bare token format is still a valid legacy format in sandbox. | Log entries #40–#42 |

## Extra Findings (beyond Section 11)

### 1. Sandbox checkout path prefix is wrong in knowledge base
The KB states sandbox uses `/sandbox/checkout/...` prefix, but sandbox actually uses the **same** `/v1/checkout/...` paths as production:
- `POST /v1/checkout/order` → **200 OK** (works)
- `POST /sandbox/checkout/order` → **404** (does not exist)

This is a critical correction — the KB's "Common configuration mistakes" section lists this as mistake #1, but it's actually the KB itself that's wrong.

### 2. `/v1/checkout/transaction` works on sandbox
The KB says this is "production-only", but `GET /v1/checkout/transaction?idType=ORDER_REFERENCE&id=...` returned `200` with valid response. The sandbox-specific variant `GET /sandbox/checkout/transaction` returns 404.

### 3. `/v1/transactions/accounts/single` — existing data found
This endpoint returned a real transaction even for our test orderReference (probably returning the most recent or a default). Returns `code: "00"` with transaction details when found.

### 4. No sandbox payment simulation endpoint exists
All attempted payment simulation paths returned 404. Card payment can only be completed via the hosted checkout page at `pay.nomba.com`.

## Suggested Edits to `nomba-knowledge-base.md` Section 11

### Q1 (debit-mandate method)
Replace current Q1 text with:
```
1. **Direct Debit — GET vs POST for debit-mandate.** Cannot be resolved empirically — this sandbox account did not have Direct Debit sandbox access enabled (all `/v1/direct-debits/*` endpoints returned 404). Still requires Nomba support to confirm.
```

### Q4 (tokenized charge decline)
Replace current Q4 text with:
```
4. **Recurring tokenized charge — synchronous failure vs webhook.** Sandbox empirical test: `POST /v1/checkout/tokenized-card-payment` returns `data.status: true` synchronously in the HTTP response for all token values (sandbox does not simulate declines). In production, a declined tokenized charge should return `data.status: false` synchronously. A `payment_failed` webhook is also expected in production for declined tokenized charges, but sandbox does not fire webhooks for tokenized-card-payment calls (no actual transaction is created). Confirm with Nomba: does a declined tokenized charge return `data.status: false` synchronously AND also fire a `payment_failed` webhook, or just one of these?
```

### Q5 (token expiry)
Replace current Q5 text with:
```
5. **Token expiry/rotation.** Sandbox empirical test: sandbox does not validate token expiry — any arbitrary tokenKey is accepted and returns success. Token management endpoints (list/update/delete) are not available under `/v1/checkout/tokenized-cards`. Cannot be resolved empirically. Requires Nomba support to clarify whether there's an API endpoint to check token validity/expiry before attempting a charge, and whether the tokenized-card-payment response distinguishes "expired token" from "card declined".
```

### Q9 (Authorization header)
Delete or update Q9 — answer confirmed:
```
9. **`Authorization` header format.** RESOLVED empirically (sandbox test): Both `Authorization: Bearer <token>` and `Authorization: <token>` (no Bearer prefix) are accepted and return `code: "00"`. The non-Bearer form is a legacy format that is still accepted. The knowledge base should standardize on `Bearer <token>` as the recommended form while noting the bare token legacy fallback.
```

### Additional KB corrections needed (outside Section 11)

**Section 8 — Sandbox vs Production table**: Change the "Checkout path prefix" row from "`/sandbox/checkout/...`" to "`/v1/checkout/...` (same path as production)". The sandbox checkout LINK domain is `pay.nomba.com/sandbox/...` but the API endpoint paths are the same.

**Section 6 — Checkout row**: Remove "(sandbox: `/sandbox/checkout/transaction`)" footnote or replace with "(sandbox: same `/v1/checkout/transaction` path — **works on sandbox despite docs saying production-only**)".
