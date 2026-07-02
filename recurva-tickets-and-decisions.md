# Recurva Findings Register → Tickets

Mechanical conversion of `recurva-unified-findings-register_V2.md` per the conversion instructions. Git branch creation was skipped per your instruction — branch names below are suggestions only, not created.

---

## 1. DECISION NEEDED — 3 rows blocked, everything else processed below

---
DECISION NEEDED: PAR-001 — Domain layer imports Sql/postgres directly at module level, contradicting the docs' "DI, no SQL" claim
Source Requirement: docs/recurva_architecture.md: "The domain layer contains no SQL and no HTTP calls... It calls infrastructure functions... by dependency injection — it does not import them directly at the module level, making the domain layer fully testable without a database or network."
Current Behavior: Every domain service imports Sql/TransactionSql and its query module at the top of the file, not injected; cancelSubscription drops to raw inline SQL inside the domain service.
Options:
  1. Rewrite the docs to describe what's actually built (a transaction-script style service layer taking a Sql handle).
  2. Actually build the described hexagonal boundary: domain functions take a repository interface, injected at the API layer.
Which option do you want implemented? (reply with the number, or provide your own alternative)
---

---
DECISION NEEDED: PAR-010 — Change-plan endpoint validates the request and returns the unchanged subscription — a silent no-op
Source Requirement: (doc's own heading) "Change-plan endpoint is a complete no-op despite being an advertised, 'proration-aware' feature"
Current Behavior: Validates the request body against changePlanSchema, fetches the subscription unchanged, and returns it with a 200 OK. The plan is never changed. calculateProration has zero callers anywhere in the codebase.
Options:
  1. Return 501 honestly until it's built.
  2. Build it by composing the already-existing calculateProration, buildInvoice, and transitionState into a changePlan function called from the route.
Which option do you want implemented? (reply with the number, or provide your own alternative)
---

---
DECISION NEEDED: PAR-011 — unpaid and ended subscription states are declared but unreachable
Source Requirement: (doc's own heading) "unpaid and ended states are declared but unreachable"
Current Behavior: unpaid and ended are included in the status type, and the transition table even defines outgoing transitions from unpaid, but nothing ever transitions into unpaid (past_due → MAX_DUNNING_REACHED goes to cancelled, not unpaid), and ended has no transitions in or out at all.
Options:
  1. Wire MAX_DUNNING_REACHED to go to unpaid (giving unpaid its own path to cancelled after a grace period — doc's stated preference, matching the dunning policy's finalAction field).
  2. Delete the unreachable states.
Which option do you want implemented? (reply with the number, or provide your own alternative)
---

Everything else in the register (74 normal tickets) is processed below without waiting on these three.

---

## 2. Excluded — superseded (Ticket-eligible = No)

No ticket or branch generated for these; each was marked superseded by the register's conflict-resolution pass and folded into the winning row's ticket via that row's Conflict Note.

| Row | Superseded by | Rule |
|---|---|---|
| ARCH-005 | PAR-005 | Rule 2 |
| ARCH-009 | APISEC-006 | Rule 2 |
| ARCH-015 | APISEC-006 | Rule 2 |
| ARCH-017 | PAR-006 | Rule 2 |
| PAR-009 | ARCH-004 | Rule 2 |
| PAR-012 | APISEC-006 | Rule 2 |
| APISEC-005 | SEC-002 | Rule 1 |
| APISEC-028 | SEC-003 | Rule 1 |

(Rows marked `Status: Compliant` were also skipped per the filter, but those aren't "superseded" — they're confirmed-correct behavior with nothing to fix: SEC-014, SEC-015, SEC-016, SEC-017, SEC-019, SEC-020, SEC-033, APISEC-024, APISEC-025, APISEC-026, APISEC-027, APISEC-029.)

---

## 3. Generated Tickets (74)

Two flags worth your attention before triage, both called out inline on the affected tickets too:

- **Priority unmapped (7 tickets):** SEC-026 through SEC-032 carry no standard Critical/High/Medium/Low severity — the source doc classified them "Defensive" or "Brittle assumption" instead of grading them, since they're open questions about undocumented Nomba Direct Debit behavior rather than confirmed bugs. I didn't force a P0–P3 label onto these; they need a manual priority call.
- **No fix option in source (20 tickets):** where the source doc didn't propose a remediation, I left the ticket's Fix field saying so rather than inventing one, per the "no invented requirements" rule. Acceptance criteria on those tickets are limited to closing the described gap, not prescribing an approach.

---
**[SEC-001] Renewal charge never calls the tokenized-card-payment endpoint**
Priority: P0
Category: missing functionality
Source Doc: API Security Review — Deviation Table, row 1; recommendation cross-referenced from "Known Unknowns Status — Fix First" #1

Source Finding:
> POST /v1/checkout/tokenized-card-payment must be called for renewal charges (Section 5, §3: "Your engine calls POST /v1/checkout/tokenized-card-payment")
> billSubscription creates a DB charge record and immediately marks it succeeded with placeholder nombaChargeId = "pending_${charge.id}" — never calls the Nomba tokenized-card-payment endpoint

Location: src/domain/billing/billing.service.ts:51-53
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Wire billing.service.ts and dunning.ts to actually call POST /v1/checkout/tokenized-card-payment via the Nomba client's charge() method, and handle success/failure responses properly. Currently no money moves. (Known Unknowns "Fix First" #1 — doc's explicit recommendation)

Acceptance Criteria:
- src/domain/billing/billing.service.ts:51-53 is updated so that: Wire billing.service.ts and dunning.ts to actually call POST /v1/checkout/tokenized-card-payment via the Nomba client's charge() method, and handle success/failure responses properly. Currently no money moves. (Known Unknowns "Fix First" #1 — doc's explicit recommendation)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-001-renewal-charge-never-calls-the-tokenized`
---

---
**[SEC-002] Webhook signature check uses simple body-hash, not Nomba's field-selective HMAC (nomba.ts)**
Priority: P0
Category: webhook handling issue
Source Doc: API Security Review — Deviation Table, row 2

Source Finding:
> Webhook payloads must be signature-verified using Nomba's field-selective HMAC scheme (Section 4: "hashingPayload = event_type + \":\" + requestId + \":\" + merchant.userId + ...")
> Verifies using HMAC(rawBody, secret) — a simple body-hash, not Nomba's custom colon-delimited field-selective scheme

Location: src/webhooks/inbound/nomba.ts:29-34
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Fix webhook signature verification in both nomba.ts and nomba-webhook.ts to use Nomba's field-selective colon-delimited HMAC scheme (Section 4), and correct header-name lookup to nomba-signature. (Known Unknowns "Fix First" #2 — doc's explicit recommendation)

Acceptance Criteria:
- src/webhooks/inbound/nomba.ts:29-34 is updated so that: Fix webhook signature verification in both nomba.ts and nomba-webhook.ts to use Nomba's field-selective colon-delimited HMAC scheme (Section 4), and correct header-name lookup to nomba-signature. (Known Unknowns "Fix First" #2 — doc's explicit recommendation)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: this finding is AUTHORITATIVE, resolved via Conflict Rule 1 (SEC wins over ARCH/APISEC) against APISEC-005

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-002-webhook-signature-check-uses-simple-body`
---

---
**[SEC-003] Same body-hash issue in nomba-webhook.ts**
Priority: P0
Category: webhook handling issue
Source Doc: API Security Review — Deviation Table, row 3

Source Finding:
> Same field-selective signature scheme required for nomba-webhook.ts as well
> Same simple body-hash approach; also reads X-Nomba-Signature header but spec name is nomba-signature

Location: src/webhooks/inbound/nomba-webhook.ts:24-27
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Same fix as SEC-002. (Known Unknowns "Fix First" #2 — doc's explicit recommendation)

Acceptance Criteria:
- src/webhooks/inbound/nomba-webhook.ts:24-27 is updated so that: Same fix as SEC-002. (Known Unknowns "Fix First" #2 — doc's explicit recommendation)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: this finding is AUTHORITATIVE, resolved via Conflict Rule 1 (SEC wins over ARCH/APISEC) against APISEC-028

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-003-same-body-hash-issue-in-nomba`
---

---
**[SEC-004] Webhook event names don't match Nomba's actual event types**
Priority: P0
Category: request-response mismatch
Source Doc: API Security Review — Deviation Table, row 4

Source Finding:
> Nomba's webhook events are payment_success, payment_failed, etc. (Section 4, Supported Events table)
> Routes dispatched on charge.success, charge.failure, refund.completed — these event names do not match any known Nomba event type

Location: src/webhooks/inbound/nomba-webhook.ts:60-64
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Align webhook event names with Nomba's actual events (payment_success, payment_failed, etc.) instead of the custom charge.success/charge.failure names currently dispatched. (Known Unknowns "Fix First" #3 — doc's explicit recommendation)

Acceptance Criteria:
- src/webhooks/inbound/nomba-webhook.ts:60-64 is updated so that: Align webhook event names with Nomba's actual events (payment_success, payment_failed, etc.) instead of the custom charge.success/charge.failure names currently dispatched. (Known Unknowns "Fix First" #3 — doc's explicit recommendation)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-004-webhook-event-names-don-t-match`
---

---
**[SEC-005] No reconciliation/requery against Nomba before treating charges as paid**
Priority: P1
Category: missing functionality
Source Doc: API Security Review — Deviation Table, row 5

Source Finding:
> Always verify transactions via API — never trust webhook alone (Section 5, §4; Section 9 Best Practices)
> No reconciliation/requery mechanism exists. Billing marks charges as paid without any verification call to /v1/transactions/accounts/single

Location: src/domain/billing/billing.service.ts + src/scheduler/billing.ts
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Add reconciliation via /v1/transactions/accounts/single. (Known Unknowns "Fix First" #5, bundled item — doc's explicit recommendation)

Acceptance Criteria:
- src/domain/billing/billing.service.ts + src/scheduler/billing.ts is updated so that: Add reconciliation via /v1/transactions/accounts/single. (Known Unknowns "Fix First" #5, bundled item — doc's explicit recommendation)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-005-no-reconciliation-requery-against-nomba-before`
---

---
**[SEC-006] Response `code` field not checked; HTTP 200 treated as success unconditionally**
Priority: P1
Category: request-response mismatch
Source Doc: API Security Review — Deviation Table, row 6

Source Finding:
> Check JSON body code field — HTTP 200 does not guarantee success (Section 7: "Always check code")
> request() throws only on non-OK HTTP status. A 200 with { "code": "02", "description": "...", "data": null } would be silently treated as success

Location: src/nomba/client.ts:66-72
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Check code field in Nomba API responses before treating as success. (Known Unknowns "Fix First" #5, bundled item — doc's explicit recommendation)

Acceptance Criteria:
- src/nomba/client.ts:66-72 is updated so that: Check code field in Nomba API responses before treating as success. (Known Unknowns "Fix First" #5, bundled item — doc's explicit recommendation)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-006-response-code-field-not-checked-http`
---

---
**[SEC-007] No X-Idempotent-key header on mutating requests**
Priority: P1
Category: missing header
Source Doc: API Security Review — Deviation Table, row 7

Source Finding:
> X-Idempotent-key header on mutating requests (Section 9 Best Practices; Section 5 recommended architecture)
> No idempotency key header is ever sent to Nomba

Location: src/nomba/client.ts:53-73
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Add X-Idempotent-key header to all mutating requests. (Known Unknowns "Fix First" #5, bundled item — doc's explicit recommendation)

Acceptance Criteria:
- src/nomba/client.ts:53-73 is updated so that: Add X-Idempotent-key header to all mutating requests. (Known Unknowns "Fix First" #5, bundled item — doc's explicit recommendation)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-007-no-x-idempotent-key-header-on`
---

---
**[SEC-008] Token refresh happens 1 minute before expiry instead of 5**
Priority: P2
Category: incorrect assumption
Source Doc: API Security Review — Deviation Table, row 8

Source Finding:
> Refresh token proactively 5 minutes before expiry (Section 1: "refresh at least 5 minutes before expiry")
> Refreshes only 1 minute before expiry (tokenExpiresAt > now + 60 * 1000)

Location: src/nomba/client.ts:11
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at src/nomba/client.ts:11 no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-008-token-refresh-happens-1-minute-before`
---

---
**[SEC-009] Token refresh uses full re-auth instead of the refresh_token endpoint**
Priority: P2
Category: auth problem
Source Doc: API Security Review — Deviation Table, row 9

Source Finding:
> Use /v1/auth/token/refresh with refresh_token for proactive refresh (Section 1, Token lifecycle #3)
> Refreshes by calling /v1/auth/token/issue (full re-auth) instead of using the refresh_token endpoint. refresh_token from initial issue is discarded

Location: src/nomba/client.ts:21-32
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at src/nomba/client.ts:21-32 no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-009-token-refresh-uses-full-re-auth`
---

---
**[SEC-010] Refund calls an entirely different endpoint (bank transfer, not checkout refund)**
Priority: P1
Category: request-response mismatch
Source Doc: API Security Review — Deviation Table, row 10

Source Finding:
> Refund endpoint: POST /v1/checkout/refund (prod) or /sandbox/checkout/refund (sandbox) (Section 6)
> Calls /v2/transfers/bank/${subAccountId} — completely different API (Nomba bank transfer endpoint, not checkout refund)

Location: src/nomba/client.ts:108-116
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at src/nomba/client.ts:108-116 no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-010-refund-calls-an-entirely-different-endpoint`
---

---
**[SEC-011] No proactive token refresh guard for long-running batch renewal jobs**
Priority: P2
Category: error-handling gap
Source Doc: API Security Review — Deviation Table, row 11

Source Finding:
> Batch renewal job: refresh token proactively before long batch exceeds 30-min lifetime (Section 9 Best Practices)
> Token is cached globally and refreshed only when nearing expiry. A batch run lasting >29 minutes would hit 401s mid-run with no recovery

Location: src/scheduler/billing.ts + src/nomba/client.ts
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at src/scheduler/billing.ts + src/nomba/client.ts no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-011-no-proactive-token-refresh-guard-for`
---

---
**[SEC-012] Webhook dedup keys on the wrong field (eventId vs requestId) — nomba-webhook.ts**
Priority: P1
Category: webhook handling issue
Source Doc: API Security Review — Deviation Table, row 12

Source Finding:
> Webhook receiver must be idempotent (Section 4 — replay risk)
> Deduplication on eventId from payload — but Nomba's payload uses requestId, not eventId

Location: src/webhooks/inbound/nomba-webhook.ts:53-58
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at src/webhooks/inbound/nomba-webhook.ts:53-58 no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-012-webhook-dedup-keys-on-the-wrong`
---

---
**[SEC-013] Checkout callback webhook has no eventId/requestId-based dedup**
Priority: P2
Category: webhook handling issue
Source Doc: API Security Review — Deviation Table, row 13

Source Finding:
> Webhook receiver must be idempotent (replay risk)
> No dedup except DB-level consumed flag, which only works for checkouts. No eventId/requestId tracking for replayed events

Location: src/webhooks/inbound/nomba.ts (checkout callback)
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at src/webhooks/inbound/nomba.ts (checkout callback) no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-013-checkout-callback-webhook-has-no-eventid`
---

---
**[SEC-018] tokenizeCard sent as a string instead of a JSON boolean**
Priority: P3
Category: request-response mismatch
Source Doc: API Security Review — Deviation Table, row 18

Source Finding:
> Tokenize card on first checkout for subscription: tokenizeCard: true (Section 3)
> Sends tokenizeCard: input.saveCard ? 'true' : 'false' — but as a string 'true'/'false', not a boolean. Nomba may accept either; spec shows JSON boolean

Location: src/nomba/client.ts:104
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at src/nomba/client.ts:104 no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-018-tokenizecard-sent-as-a-string-instead`
---

---
**[SEC-021] Live private key committed to a git-tracked .env file**
Priority: P1
Category: config issue
Source Doc: API Security Review — Deviation Table, row 21

Source Finding:
> Credentials never exposed in frontend code or version control
> NOMBA_TEST_PRIVATE_KEY is in plaintext in a git-tracked .env file

Location: .env
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Remove NOMBA_TEST_PRIVATE_KEY from git-tracked .env (add .env to .gitignore and document required vars in .env.example with placeholder values only). (Known Unknowns "Fix First" #4 — doc's explicit recommendation)

Acceptance Criteria:
- .env is updated so that: Remove NOMBA_TEST_PRIVATE_KEY from git-tracked .env (add .env to .gitignore and document required vars in .env.example with placeholder values only). (Known Unknowns "Fix First" #4 — doc's explicit recommendation)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-021-live-private-key-committed-to-a`
---

---
**[SEC-022] No rate-limit header handling / self-throttling**
Priority: P2
Category: missing functionality
Source Doc: API Security Review — Deviation Table, row 22

Source Finding:
> Respect rate-limit headers (Section 9 Performance)
> Never reads X-Rate-Limit-Remaining or self-throttles

Location: src/nomba/client.ts
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at src/nomba/client.ts no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-022-no-rate-limit-header-handling-self`
---

---
**[SEC-023] Dunning retries fabricate success without calling Nomba**
Priority: P0
Category: missing functionality
Source Doc: API Security Review — Deviation Table, row 23

Source Finding:
> Dunning/retry schedule on renewal failure (Section 5, §5)
> Dunning retries mark charge as succeeded with dummy nombaChargeId = "dunning_${charge.id}" — same bypass as billing.service.ts, never actually calls Nomba

Location: src/scheduler/dunning.ts:51-53
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Wire dunning.ts to actually call POST /v1/checkout/tokenized-card-payment via the Nomba client's charge() method. (Known Unknowns "Fix First" #1, bundled item — doc's explicit recommendation)

Acceptance Criteria:
- src/scheduler/dunning.ts:51-53 is updated so that: Wire dunning.ts to actually call POST /v1/checkout/tokenized-card-payment via the Nomba client's charge() method. (Known Unknowns "Fix First" #1, bundled item — doc's explicit recommendation)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-023-dunning-retries-fabricate-success-without-calling`
---

---
**[SEC-024] No Nomba token revocation on subscription cancellation**
Priority: P3
Category: missing functionality
Source Doc: API Security Review — Deviation Table, row 24

Source Finding:
> Cancel endpoint: No Nomba token revocation on subscription cancellation (Section 5, §6)
> Cancellation is purely app-level; never calls DELETE /v1/checkout/tokenized-cards/{id} or any token-revocation endpoint

Location: src/domain/subscription/subscription.service.ts:87-114
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at src/domain/subscription/subscription.service.ts:87-114 no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-024-no-nomba-token-revocation-on-subscription`
---

---
**[SEC-025] Webhook signature header name mismatch (X-Nomba-Signature vs nomba-signature)**
Priority: P2
Category: webhook handling issue
Source Doc: API Security Review — Deviation Table, row 25

Source Finding:
> Webhook payload includes nomba-signature header (Section 4)
> Reads X-Nomba-Signature header (with X- prefix) — spec says nomba-signature

Location: src/webhooks/inbound/nomba-webhook.ts:18
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Correct header-name lookup to nomba-signature. (Known Unknowns "Fix First" #2, bundled item — doc's explicit recommendation)

Acceptance Criteria:
- src/webhooks/inbound/nomba-webhook.ts:18 is updated so that: Correct header-name lookup to nomba-signature. (Known Unknowns "Fix First" #2, bundled item — doc's explicit recommendation)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-025-webhook-signature-header-name-mismatch-x`
---

---
**[SEC-026] Direct Debit mandate GET vs POST (unresolved — no DD code exists)**
Priority: UNMAPPED — source severity does not cleanly match Critical/High/Medium/Low; needs manual priority assignment
Category: missing functionality
Source Doc: API Security Review — Known Unknowns Status, KU #1

Source Finding:
> Debit-mandate GET vs POST
> No Direct Debit code exists at all

Location: (not specified — no Direct Debit code exists)
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at (not specified — no Direct Debit code exists) no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-026-direct-debit-mandate-get-vs-post`
---

---
**[SEC-027] Mandate status casing, ACTIVE vs Active (unresolved — no comparison code exists)**
Priority: UNMAPPED — source severity does not cleanly match Critical/High/Medium/Low; needs manual priority assignment
Category: missing functionality
Source Doc: Known Unknowns Status, KU #2

Source Finding:
> Mandate status casing (ACTIVE vs Active)
> No mandate status comparison code exists

Location: (not specified)
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at (not specified) no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-027-mandate-status-casing-active-vs-active`
---

---
**[SEC-028] Single mandate fetch vs status endpoint (unresolved — neither is called)**
Priority: UNMAPPED — source severity does not cleanly match Critical/High/Medium/Low; needs manual priority assignment
Category: missing functionality
Source Doc: Known Unknowns Status, KU #3

Source Finding:
> Single mandate fetch vs status endpoint
> Neither endpoint is called

Location: (not specified)
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at (not specified) no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-028-single-mandate-fetch-vs-status-endpoint`
---

---
**[SEC-029] Whether a Direct Debit charge triggers a webhook (unresolved; no DD case exists regardless)**
Priority: UNMAPPED — source severity does not cleanly match Critical/High/Medium/Low; needs manual priority assignment
Category: webhook handling issue
Source Doc: Known Unknowns Status, KU #4

Source Finding:
> Does DD debit trigger a webhook?
> webhook router handles only charge.success, charge.failure, refund.completed. No DD-specific event case.

Location: src/webhooks/inbound/nomba-webhook.ts:60-64
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at src/webhooks/inbound/nomba-webhook.ts:60-64 no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-029-whether-a-direct-debit-charge-triggers`
---

---
**[SEC-030] Token/charge expiry (decline) detection pre-charge (unresolved; no decline handling exists at all)**
Priority: UNMAPPED — source severity does not cleanly match Critical/High/Medium/Low; needs manual priority assignment
Category: error-handling gap
Source Doc: Known Unknowns Status, KU #5

Source Finding:
> Token expiry detection pre-charge
> All charge handling never actually calls Nomba so there's no decline handling at all. The mock path in client.ts returns mock_token_for_testing.

Location: billing.service.ts, dunning.ts; mock path in client.ts
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at billing.service.ts, dunning.ts; mock path in client.ts no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-030-token-charge-expiry-decline-detection-pre`
---

---
**[SEC-031] Idempotency key scope with Nomba (unresolved; no key currently transmitted)**
Priority: UNMAPPED — source severity does not cleanly match Critical/High/Medium/Low; needs manual priority assignment
Category: missing header
Source Doc: Known Unknowns Status, KU #6

Source Finding:
> Idempotency key scope
> No X-Idempotent-key sent to Nomba. Invoice service generates an internal idempotencyKey for DB dedup only.

Location: (invoice service — internal only)
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at (invoice service — internal only) no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-031-idempotency-key-scope-with-nomba-unresolved`
---

---
**[SEC-032] Rate limit tier (unresolved; no self-throttling exists)**
Priority: UNMAPPED — source severity does not cleanly match Critical/High/Medium/Low; needs manual priority assignment
Category: missing functionality
Source Doc: Known Unknowns Status, KU #7

Source Finding:
> Rate limit tier
> No self-throttling, no header reading

Location: (not specified)
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at (not specified) no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/SEC-032-rate-limit-tier-unresolved-no-self`
---

---
**[ARCH-001] Billing never actually charges the customer**
Priority: P0
Category: architecture concern
Source Doc: Architecture Review, Issue #1 (P0)

Source Finding:
> "Billing never actually charges the customer"
> insertCharge(...) then updateChargeStatus(s, charge.id, 'succeeded', { nombaChargeId: `pending_${charge.id}` }) then updateInvoiceStatus(s, invoice.id, 'paid') — nomba.service.ts (the actual gateway client wrapper) is never imported or called here. Every invoice is unconditionally marked succeeded/paid regardless of whether money moved. There is no failure branch for a declined card — the only failure path modeled is "no payment method attached." In a live system this means 100% of "successful" payments are fabricated, and dunning (START_DUNNING) can never actually trigger from a real decline.

Location: billing.service.ts::billSubscription
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Call nomba.chargeCard(...), branch on the real gateway result, and only mark paid/succeeded on a real success response; on decline, fire PAYMENT_FAILED and start dunning.

Acceptance Criteria:
- billing.service.ts::billSubscription is updated so that: Call nomba.chargeCard(...), branch on the real gateway result, and only mark paid/succeeded on a real success response; on decline, fire PAYMENT_FAILED and start dunning.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-001-billing-never-actually-charges-the-customer`
---

---
**[ARCH-002] retryCharge (dunning retries) is a non-functional stub**
Priority: P0
Category: architecture concern
Source Doc: Architecture Review, Issue #2 (P0)

Source Finding:
> "retryCharge (dunning retries) is a stub that does nothing real"
> Inserts a charge with paymentMethodId: null, calls updateChargeStatus(..., 'succeeded') unconditionally, and returns. It never: calls the gateway; selects backup vs. primary card (despite dunning_attempts.used_backup_card existing precisely for this); updates the invoice to paid; clears dunning attempts (cancelScheduledDunning) or transitions the subscription back to active; calls dunning.recordAttempt. A subscription can sit in past_due forever even though retryCharge reports "success," and a truly successful retry can never clear the account out of dunning.

Location: billing.service.ts::retryCharge
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (no single numbered "Fix:" given — the doc's own list of what retryCharge "never does" is the implied checklist: call the gateway, select the correct card, update the invoice, clear dunning, record the attempt)

Acceptance Criteria:
- billing.service.ts::retryCharge is updated so that: (no single numbered "Fix:" given — the doc's own list of what retryCharge "never does" is the implied checklist: call the gateway, select the correct card, update the invoice, clear dunning, record the attempt)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-002-retrycharge-dunning-retries-is-a-non`
---

---
**[ARCH-003] Re-running billing for an already-paid invoice can double-charge**
Priority: P0
Category: architecture concern
Source Doc: Architecture Review, Issue #3 (P0)

Source Finding:
> "Re-running billing for an already-paid invoice can double-charge"
> buildInvoice returns the existing invoice on idempotency-key hit, but billSubscription doesn't check the invoice's current status before continuing: finalizeInvoice unconditionally sets status back to 'open'; a brand-new charge row is inserted; invoice status is set to 'paid' again. finalizeInvoice has no guard (WHERE status = 'draft'), and charges has no unique constraint / idempotency key tying it to (invoice_id) or a gateway reference. Any retry, replay, or concurrent worker invocation on a subscription whose invoice already exists and is paid will silently regress it to open and insert a second charge.

Location: billing.service.ts::billSubscription (buildInvoice / finalizeInvoice / insertCharge sequence)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): finalizeInvoice should be a conditional transition (draft → open, no-op otherwise); billSubscription should short-circuit entirely when the existing invoice is already paid; add UNIQUE (invoice_id) WHERE status = 'succeeded' (partial unique index) on charges, or better, a gateway_idempotency_key column with a unique constraint, Stripe-style.

Acceptance Criteria:
- billing.service.ts::billSubscription (buildInvoice / finalizeInvoice / insertCharge sequence) is updated so that: finalizeInvoice should be a conditional transition (draft → open, no-op otherwise); billSubscription should short-circuit entirely when the existing invoice is already paid; add UNIQUE (invoice_id) WHERE status = 'succeeded' (partial unique index) on charges, or better, a gateway_idempotency_key column with a unique constraint, Stripe-style.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-003-re-running-billing-for-an-already`
---

---
**[ARCH-004] credit_balance applied to every invoice but never decremented**
Priority: P0
Category: architecture concern
Source Doc: Architecture Review, Issue #4 (P0)

Source Finding:
> "credit_balance is applied to every invoice but never decremented"
> amountDue = Math.max(0, total - subscription.creditBalance); creditUse = Math.min(subscription.creditBalance, total); a 'Credit balance applied' line item is inserted. Nowhere is subscriptions.credit_balance ever updated (no such mutator exists in db/queries/subscription.queries.ts; grep confirms it's never called). The same credit balance is re-applied as a discount on every subsequent invoice forever.

Location: invoice.service.ts::buildInvoice
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Decrement credit_balance by creditUse inside the same transaction that inserts the credit line item, and treat credit application in buildInvoice and the decrement as one atomic unit (they currently aren't even in a transaction together at the call site of buildInvoice).

Acceptance Criteria:
- invoice.service.ts::buildInvoice is updated so that: Decrement credit_balance by creditUse inside the same transaction that inserts the credit line item, and treat credit application in buildInvoice and the decrement as one atomic unit (they currently aren't even in a transaction together at the call site of buildInvoice).
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: AUTHORITATIVE, resolved via Conflict Rule 2 (higher severity, Critical vs. High) against PAR-009

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-004-credit-balance-applied-to-every-invoice`
---

---
**[ARCH-006] Mutable, shared plan prices retroactively reprice existing subscribers**
Priority: P1
Category: architecture concern
Source Doc: Architecture Review, Issue #6 (P1)

Source Finding:
> "Plans are mutable and shared — editing a plan retroactively repriced every active subscriber"
> updatePlan upserts plan_currencies in place. buildInvoice re-reads plan.prices live at invoice time. There is no price/version snapshot on the subscription. Changing a plan's price for new customers instantly changes the bill for every existing subscriber at their next renewal, with no grandfathering, no notice period, and no proration.

Location: plan.service.ts::updatePlan; invoice.service.ts::buildInvoice (planQueries.findPlanById)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Make plan_currencies (prices) immutable once referenced by any subscription; updatePlan should create a new price row rather than mutating the existing one; subscriptions should pin a price_id.

Acceptance Criteria:
- plan.service.ts::updatePlan; invoice.service.ts::buildInvoice (planQueries.findPlanById) is updated so that: Make plan_currencies (prices) immutable once referenced by any subscription; updatePlan should create a new price row rather than mutating the existing one; subscriptions should pin a price_id.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-006-mutable-shared-plan-prices-retroactively-reprice`
---

---
**[ARCH-007] No plan-change/upgrade-downgrade flow exists; proration code is dead**
Priority: P1
Category: architecture concern
Source Doc: Architecture Review, Issue #7 (P1)

Source Finding:
> "No plan-change / upgrade-downgrade flow exists at all"
> calculateProration is a correctly-written pure function but is never called anywhere in the codebase (confirmed via grep — no caller). There is no changePlan/updateSubscriptionPlan service method. credit_balance and proration both exist in the schema/domain but have no wiring — described as a half-shipped feature.

Location: proration.service.ts::calculateProration
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (no explicit numbered fix given — implied: build a change-plan service method that wires calculateProration in)

Acceptance Criteria:
- proration.service.ts::calculateProration is updated so that: (no explicit numbered fix given — implied: build a change-plan service method that wires calculateProration in)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-007-no-plan-change-upgrade-downgrade-flow`
---

---
**[ARCH-008] Metered usage stamped from "now," not event time — unsafe across billing-cycle rollover**
Priority: P1
Category: architecture concern
Source Doc: Architecture Review, Issue #8 (P1)

Source Finding:
> "subscription_metered_usage period is stamped from 'now,' not from the event, and isn't safe against billing-cycle rollover"
> Always stores periodStart/periodEnd from sub.currentPeriodStart/currentPeriodEnd, ignoring input.timestamp entirely (accepted and stored but never used to bucket the record). A usage event for the just-closed period arriving after the billing run has already advanced current_period_start/end silently lands in the new period, inflating the next period's bill instead. There's no "close the usage window" step tied atomically to invoice finalization.

Location: usage.service.ts::reportUsage
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Aggregate/close usage as part of the same transaction that finalizes the invoice (a hard cutover), or bucket usage by event timestamp against the plan's period boundaries rather than "whatever the subscription row currently says."

Acceptance Criteria:
- usage.service.ts::reportUsage is updated so that: Aggregate/close usage as part of the same transaction that finalizes the invoice (a hard cutover), or bucket usage by event timestamp against the plan's period boundaries rather than "whatever the subscription row currently says."
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-008-metered-usage-stamped-from-now-not`
---

---
**[ARCH-010] FOR UPDATE SKIP LOCKED issued outside any held transaction**
Priority: P2
Category: architecture concern
Source Doc: Architecture Review, Issue #10 (P1)

Source Finding:
> "FOR UPDATE SKIP LOCKED in findDueForBilling and findScheduledDunningAttempts is issued outside any transaction"
> Both queries end with FOR UPDATE SKIP LOCKED, but are called directly on sql rather than inside withTransaction. A bare query auto-commits as its own implicit transaction, so the row lock is released the instant the SELECT completes — before the caller reaches billSubscription's own separate transaction/lock. That second lock does prevent two workers processing the same subscription concurrently, but does nothing to prevent the same subscription being handed out twice by two concurrent calls to findDueForBilling in the gap between the two transactions; current safety is incidental, not designed, and breaks if billSubscription is changed to not fully depend on the fresh row read.

Location: subscription.service.ts::listDueForBilling; dunning equivalent
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Wrap the select-and-claim in one transaction that's held (or better, mark a claimed_at/worker_id on the subscription/billing_run row) so the SKIP LOCKED semantics actually do their job across the full claim→process lifecycle.

Acceptance Criteria:
- subscription.service.ts::listDueForBilling; dunning equivalent is updated so that: Wrap the select-and-claim in one transaction that's held (or better, mark a claimed_at/worker_id on the subscription/billing_run row) so the SKIP LOCKED semantics actually do their job across the full claim→process lifecycle.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-010-for-update-skip-locked-issued-outside`
---

---
**[ARCH-011] unpaid status and mark_unpaid dunning final action are unreachable**
Priority: P2
Category: architecture concern
Source Doc: Architecture Review, Issue #11 (P1)

Source Finding:
> "unpaid status and mark_unpaid dunning final action are unreachable dead states"
> No transition anywhere targets unpaid (only unpaid has outgoing transitions). evaluatePolicy can return 'mark_unpaid' as a DunningPolicyDecision, but the state machine has no event mapping past_due → unpaid; the only terminal event from past_due, MAX_DUNNING_REACHED, always goes to cancelled. A tenant who configures final_action = 'mark_unpaid' on their dunning policy gets subscriptions cancelled anyway — the configured behavior is silently ignored.

Location: subscription.state-machine.ts; dunning.service.ts::evaluatePolicy
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (framed as an open design choice, not a single fix: "Either the state machine is missing a transition, or unpaid is vestigial and the column/enum should be removed.")

Acceptance Criteria:
- subscription.state-machine.ts; dunning.service.ts::evaluatePolicy is updated so that: (framed as an open design choice, not a single fix: "Either the state machine is missing a transition, or unpaid is vestigial and the column/enum should be removed.")
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-011-unpaid-status-and-mark-unpaid-dunning`
---

---
**[ARCH-012] Dunning attempts queried without invoice/cycle scoping**
Priority: P2
Category: architecture concern
Source Doc: Architecture Review, Issue #12 (P1)

Source Finding:
> "dunning_attempts are not scoped to a specific invoice/cycle when queried"
> findDunningAttemptsBySubscription returns every dunning attempt ever created for that subscription across all invoices/cycles, with no invoice_id filter or time window. If dunning is initiated twice for the same subscription (e.g. two different invoices go past-due, or a duplicate PAYMENT_FAILED event), the schedules interleave and recordAttempt's .find(a => a.status === 'scheduled') can mark the wrong invoice's attempt as succeeded/failed. detectSelfCure returns true if any attempt ever succeeded, even from an unrelated invoice months ago.

Location: recordAttempt, evaluatePolicy, detectSelfCure (all call findDunningAttemptsBySubscription)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Scope all dunning attempt queries by invoice_id (or at minimum, only ever consider attempts created after the subscription's most recent transition into past_due).

Acceptance Criteria:
- recordAttempt, evaluatePolicy, detectSelfCure (all call findDunningAttemptsBySubscription) is updated so that: Scope all dunning attempt queries by invoice_id (or at minimum, only ever consider attempts created after the subscription's most recent transition into past_due).
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-012-dunning-attempts-queried-without-invoice-cycle`
---

---
**[ARCH-013] Per-subscription dunning_policy_id is a dead column**
Priority: P3
Category: architecture concern
Source Doc: Architecture Review, Issue #13 (P1)

Source Finding:
> "subscriptions.dunning_policy_id is a dead column"
> The schema carries a per-subscription dunning_policy_id with an FK, but initiateDunning and evaluatePolicy only ever call findDefaultDunningPolicy(tenantId) — the subscription's own policy id is never read. Per-subscription dunning policy overrides are schema-only, not functional.

Location: dunning.service.ts::initiateDunning, evaluatePolicy
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at dunning.service.ts::initiateDunning, evaluatePolicy no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-013-per-subscription-dunning-policy-id-is`
---

---
**[ARCH-014] Deleting the primary payment method leaves no fallback**
Priority: P2
Category: architecture concern
Source Doc: Architecture Review, Issue #14 (P2)

Source Finding:
> "Payment-method lifecycle leaves customers with no working default"
> Deletes a method (including an is_primary = TRUE one) with no re-promotion of another method to primary. The next billing attempt for that customer finds getDefaultPaymentMethod → null and, per ARCH-001's sibling logic in billSubscription, goes straight to PAYMENT_FAILED/dunning instead of falling back to a backup card that may still be on file.

Location: payment-method.service.ts::deletePaymentMethod
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at payment-method.service.ts::deletePaymentMethod no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-014-deleting-the-primary-payment-method-leaves`
---

---
**[ARCH-016] Period rollover math drifts from calendar-month semantics**
Priority: P2
Category: architecture concern
Source Doc: Architecture Review, Issue #16 (P2)

Source Finding:
> "Period rollover math drifts from calendar semantics"
> Advances the period by the previous period's millisecond duration rather than by the plan's actual interval/interval_count (e.g. "1 month"). Months aren't a fixed number of milliseconds (28–31 days), so over several cycles the billing anchor date will drift, and a plan defined as "monthly" won't reliably land on the same day-of-month.

Location: billing.service.ts::billSubscription — `nextPeriodEnd = new Date(nextPeriodStart.getTime() + (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()))`
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (not given as a numbered fix — doc contrasts with Stripe's approach: anchor on the subscription's billing_cycle_anchor and compute the next period from the calendar interval)

Acceptance Criteria:
- billing.service.ts::billSubscription — `nextPeriodEnd = new Date(nextPeriodStart.getTime() + (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()))` is updated so that: (not given as a numbered fix — doc contrasts with Stripe's approach: anchor on the subscription's billing_cycle_anchor and compute the next period from the calendar interval)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-016-period-rollover-math-drifts-from-calendar`
---

---
**[ARCH-018] createSubscription does not type-check — missing import**
Priority: P3
Category: architecture concern
Source Doc: Architecture Review, Issue #18 (P2)

Source Finding:
> "Compile-time defect"
> Declares `let status: SubscriptionStatus;` but SubscriptionStatus is never imported into that file — this doesn't type-check today (a compilation failure, not a style issue).

Location: subscription.service.ts::createSubscription
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at subscription.service.ts::createSubscription no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/ARCH-018-createsubscription-does-not-type-check-missing`
---

---
**[PAR-000] Repository does not boot — core infrastructure files reported missing**
Priority: P0
Category: architecture concern
Source Doc: Principal Architecture Review — "Zero-th finding"; restated as P0 roadmap item #1

Source Finding:
> "Before evaluating design quality, I checked whether the system boots. It doesn't, and not by a small margin." (doc's own "Zero-th finding," stated before its numbered list)
> Per this doc, `bun run dev` throws a module-resolution error before the process finishes booting, because none of src/logger.ts, src/db/client.ts, src/db/queries/* (11 modules), src/nomba/client.ts, src/portal/routes.ts, src/dashboard/routes.ts, src/reports/routes.ts, src/webhooks/inbound/*, or src/db/migrate.ts exist in the repository as reviewed. Zero test files exist despite `bun test` being documented.

Location: src/index.ts (imports ./logger, ./db/client, ./scheduler/runner — none exist per this doc); src/api/app.ts (imports src/db/*, src/nomba/client.ts, src/portal/routes.ts, src/dashboard/routes.ts, src/reports/routes.ts, src/webhooks/inbound/* — none exist per this doc); package.json (bun run migrate wired to a src/db/migrate.ts the doc says doesn't exist)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Add the missing src/db/client.ts, src/db/transaction.ts, src/db/queries/*, src/logger.ts, src/nomba/client.ts, src/scheduler/*, src/webhooks/inbound/*, src/portal/routes.ts, src/dashboard/routes.ts, src/reports/routes.ts. Get `bun run dev` to boot and `GET /health` to return 200 against a real Postgres.

Acceptance Criteria:
- src/index.ts (imports ./logger, ./db/client, ./scheduler/runner — none exist per this doc); src/api/app.ts (imports src/db/*, src/nomba/client.ts, src/portal/routes.ts, src/dashboard/routes.ts, src/reports/routes.ts, src/webhooks/inbound/* — none exist per this doc); package.json (bun run migrate wired to a src/db/migrate.ts the doc says doesn't exist) is updated so that: Add the missing src/db/client.ts, src/db/transaction.ts, src/db/queries/*, src/logger.ts, src/nomba/client.ts, src/scheduler/*, src/webhooks/inbound/*, src/portal/routes.ts, src/dashboard/routes.ts, src/reports/routes.ts. Get `bun run dev` to boot and `GET /health` to return 200 against a real Postgres.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: See Conflicts §1 (open, unresolved): this directly contradicts SEC/ARCH/APISEC, which cite line numbers inside these same files as if they exist and were reviewed — a 3-against-1 discrepancy the owner needs to check before scheduling file-path-specific work.

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-000-repository-does-not-boot-core-infrastructure`
---

---
**[PAR-002] billSubscription fabricates a successful charge without calling the payment gateway**
Priority: P0
Category: architecture concern
Source Doc: Principal Architecture Review, Finding #2

Source Finding:
> "The billing engine never charges the customer" (doc's own heading)
> insertCharge → updateChargeStatus(..., 'succeeded', { nombaChargeId: `pending_${charge.id}` }) → updateInvoiceStatus(..., 'paid'), with no call to chargeCard, no gateway round-trip, no decline handling; nombaChargeId is literally the string `pending_<internal id>`. retryCharge does the same, additionally passing paymentMethodId: null.

Location: src/domain/billing/billing.service.ts::billSubscription; retryCharge
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Check payment method exists (transition to PAYMENT_FAILED if not) → insert pending charge → call chargeCard with idempotencyKey: charge.id → on success, mark succeeded and advance the period; on failure, mark failed, transition to PAYMENT_FAILED, call initiateDunning.

Acceptance Criteria:
- src/domain/billing/billing.service.ts::billSubscription; retryCharge is updated so that: Check payment method exists (transition to PAYMENT_FAILED if not) → insert pending charge → call chargeCard with idempotencyKey: charge.id → on success, mark succeeded and advance the period; on failure, mark failed, transition to PAYMENT_FAILED, call initiateDunning.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Independently flagged alongside SEC-001, SEC-023, ARCH-001, ARCH-002 — four separate documents identifying the same root cause; severities agree (all Critical).

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-002-billsubscription-fabricates-a-successful-charge-without`
---

---
**[PAR-003] State machine's sideEffects array is computed but never read or executed**
Priority: P0
Category: architecture concern
Source Doc: Principal Architecture Review, Finding #3

Source Finding:
> "State machine computes side effects that nothing executes" (doc's own heading)
> transitionState destructures only { nextState } from applyTransition and discards sideEffects; cancelSubscription does the same. No code in the reviewed slice ever reads sideEffects.

Location: subscription.state-machine.ts (applyTransition returns { nextState, sideEffects }); transitionState and cancelSubscription in the service layer
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Make the state machine the single source of truth for orchestration with a dispatcher: return { subscription, sideEffects } from transitionState and execute sideEffects either synchronously after commit or via an outbox table drained by a worker.

Acceptance Criteria:
- subscription.state-machine.ts (applyTransition returns { nextState, sideEffects }); transitionState and cancelSubscription in the service layer is updated so that: Make the state machine the single source of truth for orchestration with a dispatcher: return { subscription, sideEffects } from transitionState and execute sideEffects either synchronously after commit or via an outbox table drained by a worker.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Related to ARCH-011: the MAX_DUNNING_REACHED → unpaid transition this fix would need is itself missing.

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-003-state-machine-s-sideeffects-array-is`
---

---
**[PAR-004] Dunning and outbound-webhook modules are fully implemented but have zero callers**
Priority: P1
Category: architecture concern
Source Doc: Principal Architecture Review, Finding #4

Source Finding:
> "Dunning and outbound webhooks are fully-built, fully orphaned modules" (doc's own heading)
> A grep for callers of initiateDunning, evaluatePolicy, detectSelfCure, recordAttempt, enqueueEvent, and signPayload returns zero callers, for all of them, anywhere. billSubscription's failure path transitions to past_due and returns without calling initiateDunning. No domain event ever calls enqueueEvent, so a tenant registering a webhook endpoint would get a 200 OK on registration and then never receive a single event.

Location: dunning.service.ts (initiateDunning, evaluatePolicy, detectSelfCure, recordAttempt); webhook.service.ts (enqueueEvent, signPayload)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Wire both into the failure path (call initiateDunning on charge failure) and into a single domain-event publish seam (publishDomainEvent), called from exactly the points the state machine's sideEffects identify.

Acceptance Criteria:
- dunning.service.ts (initiateDunning, evaluatePolicy, detectSelfCure, recordAttempt); webhook.service.ts (enqueueEvent, signPayload) is updated so that: Wire both into the failure path (call initiateDunning on charge failure) and into a single domain-event publish seam (publishDomainEvent), called from exactly the points the state machine's sideEffects identify.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-004-dunning-and-outbound-webhook-modules-are`
---

---
**[PAR-005] Coupons are validated and computed but never attached to a subscription or applied during real billing**
Priority: P0
Category: architecture concern
Source Doc: Principal Architecture Review, Finding #5

Source Finding:
> "Coupons are validated, computed, and then never actually attached or applied" (doc's own heading)
> Three separate breaks: (1) input.couponCode is silently discarded at subscription creation; (2) billSubscription calls buildInvoice without applyCoupon, so no coupon is ever applied on a real billing cycle; (3) two disconnected code paths exist for redemption bookkeeping, and the one with validation logic is not the one that runs during billing.

Location: subscription.service.ts::createSubscription (hardcodes couponId: null); invoice.service.ts::buildInvoice (only applies a coupon when called with { applyCoupon: true }, and billSubscription never passes it); coupon.service.ts::recordRedemption (zero callers — invoice.service.ts calls couponQueries.incrementMonthsApplied directly instead, bypassing validateCoupon)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Resolve the coupon at subscription-creation time (validate + attach couponId); make coupon application mandatory (not opt-in) inside buildInvoice whenever subscription.couponId is set — delete the applyCoupon flag entirely; route all redemption bookkeeping through one function.

Acceptance Criteria:
- subscription.service.ts::createSubscription (hardcodes couponId: null); invoice.service.ts::buildInvoice (only applies a coupon when called with { applyCoupon: true }, and billSubscription never passes it); coupon.service.ts::recordRedemption (zero callers — invoice.service.ts calls couponQueries.incrementMonthsApplied directly instead, bypassing validateCoupon) is updated so that: Resolve the coupon at subscription-creation time (validate + attach couponId); make coupon application mandatory (not opt-in) inside buildInvoice whenever subscription.couponId is set — delete the applyCoupon flag entirely; route all redemption bookkeeping through one function.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: AUTHORITATIVE, resolved via Conflict Rule 2 (higher severity, Critical vs. High) against ARCH-005.

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-005-coupons-are-validated-and-computed-but`
---

---
**[PAR-006] Tenant authentication is an O(N) blocking bcrypt scan across every tenant's keys, on every request**
Priority: P0
Category: architecture concern
Source Doc: Principal Architecture Review, Finding #6

Source Finding:
> "Auth is O(N) bcrypt scans across every tenant, on every request" (doc's own heading)
> Fetches every active API key belonging to every tenant on the platform, then loops calling bcrypt.compareSync (synchronous, blocks the event loop) against each until one matches. tenant_api_keys.key_prefix exists in the schema, purpose-built to narrow the search, but the query doesn't use it.

Location: tenant.service.ts::authenticateTenant
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Filter the query by key_prefix = rawKey.slice(0, KEY_PREFIX_LENGTH) first (narrowing to 0-1 rows in the common case), and switch to async bcrypt.compare instead of the blocking compareSync. Add a supporting index: CREATE INDEX idx_api_keys_prefix ON tenant_api_keys(key_prefix) WHERE is_active = TRUE.

Acceptance Criteria:
- tenant.service.ts::authenticateTenant is updated so that: Filter the query by key_prefix = rawKey.slice(0, KEY_PREFIX_LENGTH) first (narrowing to 0-1 rows in the common case), and switch to async bcrypt.compare instead of the blocking compareSync. Add a supporting index: CREATE INDEX idx_api_keys_prefix ON tenant_api_keys(key_prefix) WHERE is_active = TRUE.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: AUTHORITATIVE, resolved via Conflict Rule 2 (higher severity, Critical vs. Low-Medium) against ARCH-017.

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-006-tenant-authentication-is-an-o-n`
---

---
**[PAR-007] Payment gateway calls, once wired in, would sit inside the same DB transaction as the row lock**
Priority: P1
Category: architecture concern
Source Doc: Principal Architecture Review, Finding #7

Source Finding:
> "Payment gateway calls belong outside the DB transaction, everywhere they'd be added" (doc's own heading)
> Every domain mutation that would eventually need to call Nomba is wrapped in withTransaction. If chargeCard were called inside that same Postgres transaction, a slow/hung Nomba HTTP call would hold a row lock (from FOR UPDATE) for the round-trip duration, and a rollback after a gateway timeout could leave the local charge record ambiguous relative to what actually happened at the gateway.

Location: (forward-looking finding about where PAR-002's fix would naturally land) src/domain/billing/billing.service.ts::billSubscription
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Two-phase, idempotency-key-based commit instead of one wrapping transaction: TX1 inserts a pending charge row with a generated idempotency key and commits; the gateway call happens outside any DB transaction using that idempotency key; TX2 updates status based on the gateway result.

Acceptance Criteria:
- (forward-looking finding about where PAR-002's fix would naturally land) src/domain/billing/billing.service.ts::billSubscription is updated so that: Two-phase, idempotency-key-based commit instead of one wrapping transaction: TX1 inserts a pending charge row with a generated idempotency key and commits; the gateway call happens outside any DB transaction using that idempotency key; TX2 updates status based on the gateway result.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Doc itself notes this depends on whether Nomba's API supports idempotency keys — verify before relying on it. Related but distinct from ARCH-003 (missing invoice-status guard, not a transaction-boundary issue).

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-007-payment-gateway-calls-once-wired-in`
---

---
**[PAR-008] No structural enforcement of the API/domain/infra boundary**
Priority: P1
Category: architecture concern
Source Doc: Principal Architecture Review, Finding #8

Source Finding:
> "Domain leakage into route handlers — raw SQL and direct DB access bypass the domain layer" (doc's own heading)
> Route handlers pull sql = getDb() and pass the raw connection into domain functions with no request-scoped transaction boundary and no abstraction; the API layer and domain layer share the same Sql type, so nothing structurally stops a future route handler from hitting the DB directly, as the health check already does.

Location: src/api/app.ts (health check runs raw SQL inline); route handlers generally (getDb() passed straight into domain functions)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Don't export a raw getDb(): Sql importable by both layers; give the API layer a structurally distinct, request-scoped handle (e.g. a type-branded wrapper) so a lint rule (eslint-plugin-boundaries or similar) can forbid src/api/** from importing db/queries/* or postgres directly.

Acceptance Criteria:
- src/api/app.ts (health check runs raw SQL inline); route handlers generally (getDb() passed straight into domain functions) is updated so that: Don't export a raw getDb(): Sql importable by both layers; give the API layer a structurally distinct, request-scoped handle (e.g. a type-branded wrapper) so a lint rule (eslint-plugin-boundaries or similar) can forbid src/api/** from importing db/queries/* or postgres directly.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Same root cause as PAR-001 (no structural DI boundary) manifesting at a different layer.

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-008-no-structural-enforcement-of-the-api`
---

---
**[PAR-013] Portal and (unreviewed) admin auth may share a JWT secret with no token-type claim check**
Priority: P2
Category: auth problem
Source Doc: Principal Architecture Review, Finding #13

Source Finding:
> "Shared JWT secret across two different trust boundaries" (doc's own heading) — doc itself flags this as "not fully verifiable from this slice"
> The same secret name (JWT_SECRET) is used, per the README/config, for tenant-admin auth as well; verifyPortalToken casts the result to PortalClaims with no explicit claim distinguishing a portal token from any other token type signed with the same secret.

Location: portal.service.ts (signs with config.JWT_SECRET; verifyPortalToken does jwt.verify(token, config.JWT_SECRET) with no aud/iss/typ claim check)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Separate secrets per trust boundary (PORTAL_JWT_SECRET vs ADMIN_JWT_SECRET), and always include and check an explicit typ: 'portal_session' claim, verified on every decode.

Acceptance Criteria:
- portal.service.ts (signs with config.JWT_SECRET; verifyPortalToken does jwt.verify(token, config.JWT_SECRET) with no aud/iss/typ claim check) is updated so that: Separate secrets per trust boundary (PORTAL_JWT_SECRET vs ADMIN_JWT_SECRET), and always include and check an explicit typ: 'portal_session' claim, verified on every decode.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Doc itself flags this as not fully verifiable from the reviewed slice — depends on the unreviewed admin-auth code.

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-013-portal-and-unreviewed-admin-auth-may`
---

---
**[PAR-014] Structured logging infrastructure exists in shape but nothing produces it**
Priority: P2
Category: architecture concern
Source Doc: Principal Architecture Review, Finding #14

Source Finding:
> "Observability: structured logging exists in shape, but nothing produces it" (doc's own heading)
> pino/pino-pretty are dependencies, and request-logging middleware exists, but the logger singleton itself doesn't exist in this slice, and no service emits a log line on charge success/failure, state transition, or dunning attempt. No tracing/metrics beyond the doc's aspirational mention.

Location: src/api/middleware/logger.ts (per-request middleware); src/logger.ts (the singleton everything imports — per PAR-000, doesn't exist in this slice)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Emit one structured log line per domain-significant event (subscription.transitioned, charge.attempted, charge.failed, webhook.delivered), always including tenantId, routed through the same event-publish seam as outbound webhooks.

Acceptance Criteria:
- src/api/middleware/logger.ts (per-request middleware); src/logger.ts (the singleton everything imports — per PAR-000, doesn't exist in this slice) is updated so that: Emit one structured log line per domain-significant event (subscription.transitioned, charge.attempted, charge.failed, webhook.delivered), always including tenantId, routed through the same event-publish seam as outbound webhooks.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Related to PAR-000: src/logger.ts is among the files that finding reports missing.

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-014-structured-logging-infrastructure-exists-in-shape`
---

---
**[PAR-015] Multi-currency modeling is present but shallow — no documented FX/rounding policy**
Priority: P3
Category: architecture concern
Source Doc: Principal Architecture Review, Finding #15

Source Finding:
> "Multi-currency modeling is present but shallow" (doc's own heading)
> currency is a per-subscription field constrained to four currencies, with per-currency plan prices — a reasonable start per the doc. No FX/rounding policy is documented for proration math across currencies with different minor-unit conventions. validateCoupon does correctly check currency-mismatch for fixed-amount coupons (doc credits this as solid). Each currency is fully independent today (no conversion), which the doc considers the right call but says should be stated as a deliberate constraint rather than left ambiguous.

Location: currency field (CHECK constraint to NGN/USD/GBP/EUR); plan per-currency prices; proration math
Fix: No fix option was proposed in the source document. Acceptance criteria below are derived directly from closing the gap between Source Requirement and Current Behavior; no fix approach is prescribed.

Acceptance Criteria:
- Behavior at currency field (CHECK constraint to NGN/USD/GBP/EUR); plan per-currency prices; proration math no longer matches the deviation described in Current Behavior above.
- System satisfies the Source Requirement above (exact remediation approach not specified in source — needs scoping before implementation).

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-015-multi-currency-modeling-is-present-but`
---

---
**[PAR-016] Domain module (DDD) boundaries are well-chosen — the one structurally sound part of the codebase**
Priority: P3
Category: —
Source Doc: Principal Architecture Review, Finding #16

Source Finding:
> "Domain module organization and DDD boundaries" (doc's own heading) — "the one genuinely good structural decision"
> The module boundaries map cleanly onto Stripe/Chargebee's own module boundaries, per the doc. The nomba module is correctly isolated as the only place that should know about the specific gateway — provided billing.service.ts is fixed to call it through an interface rather than a concrete import (see PAR-002 and this row's own recommended tightening).

Location: src/domain/<bounded-context>/{service,types}.ts split (subscription, billing, invoice, dunning, proration, coupon, usage, payment-method, tenant, customer, webhook, portal, plan, nomba)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Introduce a PaymentGateway interface in the billing module that nomba.service implements, so billing.service.ts depends on an abstraction rather than a concrete provider — the seam needed for future provider support (Paystack/Flutterwave) and eventual service extraction.

Acceptance Criteria:
- src/domain/<bounded-context>/{service,types}.ts split (subscription, billing, invoice, dunning, proration, coupon, usage, payment-method, tenant, customer, webhook, portal, plan, nomba) is updated so that: Introduce a PaymentGateway interface in the billing module that nomba.service implements, so billing.service.ts depends on an abstraction rather than a concrete provider — the seam needed for future provider support (Paystack/Flutterwave) and eventual service extraction.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/PAR-016-domain-module-ddd-boundaries-are-well`
---

---
**[APISEC-001] SSRF via outbound webhook URL registration**
Priority: P0
Category: security gap
Source Doc: API Security & Architecture Review, §1.1

Source Finding:
> "SSRF via outbound webhook URL registration" (doc's own heading)
> No allowlist, no denial of RFC1918/loopback/link-local ranges (e.g. 169.254.169.254 cloud metadata), no DNS-rebinding protection, no redirect policy. Any tenant can register an internal/metadata URL and have the server make authenticated-context requests to it on a schedule, with the response echoed back into webhook_deliveries.last_response_body, readable via GET /v1/webhooks/endpoints/:id/deliveries.

Location: src/api/validators/webhook.validator.ts (registerWebhookSchema: url: z.string().url() — accepts any URL); src/webhooks/outbound/delivery.ts (raw server-side fetch(endpoint.url, …))
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Resolve and validate the hostname at registration time and again at delivery time (block private/loopback/link-local/multicast ranges, disallow non-http(s) schemes, disallow redirects to disallowed hosts, pin the resolved IP for the request). Consider an egress proxy for all outbound webhook traffic.

Acceptance Criteria:
- src/api/validators/webhook.validator.ts (registerWebhookSchema: url: z.string().url() — accepts any URL); src/webhooks/outbound/delivery.ts (raw server-side fetch(endpoint.url, …)) is updated so that: Resolve and validate the hostname at registration time and again at delivery time (block private/loopback/link-local/multicast ranges, disallow non-http(s) schemes, disallow redirects to disallowed hosts, pin the resolved IP for the request). Consider an egress proxy for all outbound webhook traffic.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-001-ssrf-via-outbound-webhook-url-registration`
---

---
**[APISEC-002] Documented rate limiting is entirely unimplemented**
Priority: P0
Category: security gap
Source Doc: API Security & Architecture Review, §1.2

Source Finding:
> docs/api-reference.md: "| /webhooks/nomba | 100 req/min per IP | | All other endpoints | 1000 req/min per tenant |"
> No rate-limiting file anywhere in src. /v1/tenants/register (no auth), the auth check itself, and every mutating endpoint are unthrottled.

Location: app.ts (middleware chain is only requestIdMiddleware + loggingMiddleware); package.json (no rate-limiting or Redis dependency)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Implement the documented limits (token bucket per tenant/IP) before public exposure, and add the promised X-RateLimit-* response headers so the docs match reality.

Acceptance Criteria:
- app.ts (middleware chain is only requestIdMiddleware + loggingMiddleware); package.json (no rate-limiting or Redis dependency) is updated so that: Implement the documented limits (token bucket per tenant/IP) before public exposure, and add the promised X-RateLimit-* response headers so the docs match reality.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Same gap named again as APISEC-020, under Low/DX, as "the most damaging DX issue."

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-002-documented-rate-limiting-is-entirely-unimplemented`
---

---
**[APISEC-003] Documented Idempotency-Key header support is unimplemented**
Priority: P0
Category: security gap
Source Doc: API Security & Architecture Review, §1.3

Source Finding:
> docs/api-reference.md: "Key mutating endpoints support idempotency via the Idempotency-Key header... POST /v1/subscriptions, POST /v1/subscriptions/:id/usage..."
> idempotencyKey/Idempotency-Key appears exactly once in the whole src tree, as a body field in usage.validator.ts; never read as a header, never deduplicated against, not implemented for subscription creation or invoice retry.

Location: usage.validator.ts (idempotencyKey appears once, as a body field only); POST /v1/subscriptions, POST /v1/invoices/:id/retry (no idempotency handling at all)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Implement a real idempotency table (tenant_id, idempotency_key) unique, storing the response to replay, and require the header on every state-mutating financial endpoint, exactly as documented.

Acceptance Criteria:
- usage.validator.ts (idempotencyKey appears once, as a body field only); POST /v1/subscriptions, POST /v1/invoices/:id/retry (no idempotency handling at all) is updated so that: Implement a real idempotency table (tenant_id, idempotency_key) unique, storing the response to replay, and require the header on every state-mutating financial endpoint, exactly as documented.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Same general problem, outbound direction, as SEC-007/SEC-031 (Recurva also never sends an idempotency key to Nomba).

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-003-documented-idempotency-key-header-support-is`
---

---
**[APISEC-004] Payment gateway client is hardcoded to Nomba's live environment, always**
Priority: P0
Category: config issue
Source Doc: API Security & Architecture Review, §1.4

Source Finding:
> "Payment gateway client is hardcoded to LIVE, always" (doc's own heading)
> No branching on tenant mode, even though README.md documents both NOMBA_SANDBOX_SECRET and NOMBA_LIVE_SECRET, and the integration test inserts tenants with mode: 'test'. Auth docs only ever show rk_live_... keys — no rk_test_ concept anywhere in the reviewed code. Every charge/refund/checkout call, from every tenant including testing, goes to Nomba's production rails with the production secret.

Location: src/nomba/client.ts (`const baseUrl = config.NOMBA_LIVE_BASE_URL;` ... `'Authorization': \`Bearer ${config.NOMBA_LIVE_SECRET}\`,`)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Branch the client (and the API key prefix check) on tenant.mode, and fail closed if a live key is used against a sandbox-configured tenant or vice versa.

Acceptance Criteria:
- src/nomba/client.ts (`const baseUrl = config.NOMBA_LIVE_BASE_URL;` ... `'Authorization': \`Bearer ${config.NOMBA_LIVE_SECRET}\`,`) is updated so that: Branch the client (and the API key prefix check) on tenant.mode, and fail closed if a live key is used against a sandbox-configured tenant or vice versa.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: See Conflicts §4 (unconfirmed, needs verification): this describes client.ts using a static Bearer ${config.NOMBA_LIVE_SECRET}, whereas SEC-008/SEC-009 describe the same file using a dynamically-issued/refreshed OAuth-style token via /v1/auth/token/issue — possibly different code paths in the same file rather than a true contradiction.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-004-payment-gateway-client-is-hardcoded-to`
---

---
**[APISEC-006] TOCTOU races in "idempotent" webhook processing (both inbound handlers)**
Priority: P0
Category: webhook handling issue
Source Doc: API Security & Architecture Review, §1.6

Source Finding:
> "TOCTOU races in 'idempotent' webhook processing" (doc's own heading)
> Both handlers use check-then-act instead of an atomic claim. Two concurrent/rapidly-retried deliveries of the same event can both pass the "not yet processed" check before either write completes, leading to a double-attached payment method, a duplicate subscription-state transition, or a duplicate refund application.

Location: src/webhooks/inbound/nomba-webhook.ts (SELECT ... WHERE nomba_event_id = ... check, then INSERT at the very end); src/webhooks/inbound/nomba.ts (if (checkout.consumed) check, then markPendingCheckoutConsumed only after side effects)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Claim the event atomically — INSERT ... ON CONFLICT (nomba_event_id) DO NOTHING RETURNING id (bail if zero rows), or UPDATE pending_checkouts SET consumed = true WHERE id = $1 AND consumed = false RETURNING id — before doing any side-effecting work, not after.

Acceptance Criteria:
- src/webhooks/inbound/nomba-webhook.ts (SELECT ... WHERE nomba_event_id = ... check, then INSERT at the very end); src/webhooks/inbound/nomba.ts (if (checkout.consumed) check, then markPendingCheckoutConsumed only after side effects) is updated so that: Claim the event atomically — INSERT ... ON CONFLICT (nomba_event_id) DO NOTHING RETURNING id (bail if zero rows), or UPDATE pending_checkouts SET consumed = true WHERE id = $1 AND consumed = false RETURNING id — before doing any side-effecting work, not after.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: AUTHORITATIVE, resolved via Conflict Rule 2 as highest severity (Critical) among the ARCH-009/ARCH-015/PAR-012/APISEC-006 check-then-act/TOCTOU cluster. Same class of bug independently identified in SEC-012, SEC-013, ARCH-009, PAR-012.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-006-toctou-races-in-idempotent-webhook-processing`
---

---
**[APISEC-007] Tenant auth middleware is opt-in per router, not enforced globally**
Priority: P1
Category: auth problem
Source Doc: API Security & Architecture Review, §2.1

Source Finding:
> "Auth is opt-in per router, not enforced globally" (doc's own heading)
> Nine separate route files each have to remember to apply tenantAuthMiddleware; a new route file that forgets is silently public. No test or lint rule visible that would catch this.

Location: every route file (router.use('*', tenantAuthMiddleware) called individually); app.ts (no default-deny)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Invert the default — apply tenantAuthMiddleware at the v1 router level, and explicitly allowlist/exempt the few public paths (/tenants/register) rather than requiring every new router to opt in.

Acceptance Criteria:
- every route file (router.use('*', tenantAuthMiddleware) called individually); app.ts (no default-deny) is updated so that: Invert the default — apply tenantAuthMiddleware at the v1 router level, and explicitly allowlist/exempt the few public paths (/tenants/register) rather than requiring every new router to opt in.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-007-tenant-auth-middleware-is-opt-in`
---

---
**[APISEC-008] Unbounded, unvalidated `metadata` fields on customer/subscription creation**
Priority: P1
Category: request-response mismatch
Source Doc: API Security & Architecture Review, §2.2

Source Finding:
> "Unbounded, unvalidated metadata fields" (doc's own heading)
> No size cap, no depth cap, no key-count cap. A multi-megabyte or deeply-nested blob is valid input, and arbitrary attacker-controlled data lands in the DB unshaped.

Location: customer.validator.ts, subscription.validator.ts — metadata: z.record(z.unknown()).optional()
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Cap serialized size (e.g. .refine(v => JSON.stringify(v).length < 4096)) and/or nesting depth.

Acceptance Criteria:
- customer.validator.ts, subscription.validator.ts — metadata: z.record(z.unknown()).optional() is updated so that: Cap serialized size (e.g. .refine(v => JSON.stringify(v).length < 4096)) and/or nesting depth.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-008-unbounded-unvalidated-metadata-fields-on-customer`
---

---
**[APISEC-009] No CORS policy, no security headers at the app level**
Priority: P1
Category: security gap
Source Doc: API Security & Architecture Review, §2.3

Source Finding:
> "No CORS policy, no security headers" (doc's own heading)
> If the customer Portal calls this API directly, there's no visible CORS configuration governing which origins may do so — that logic would have to live entirely in the unseen portal module.

Location: package.json (no hono/cors, no helmet-equivalent); app.ts (sets none of CSP/HSTS/X-Content-Type-Options/frame-ancestors)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Add explicit CORS middleware scoped to known portal origins, and baseline security headers, at the app level rather than relying on route-by-route discipline.

Acceptance Criteria:
- package.json (no hono/cors, no helmet-equivalent); app.ts (sets none of CSP/HSTS/X-Content-Type-Options/frame-ancestors) is updated so that: Add explicit CORS middleware scoped to known portal origins, and baseline security headers, at the app level rather than relying on route-by-route discipline.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-009-no-cors-policy-no-security-headers`
---

---
**[APISEC-010] Missing business-rule validation (schemas syntactically valid but semantically wrong)**
Priority: P1
Category: request-response mismatch
Source Doc: API Security & Architecture Review, §2.4

Source Finding:
> "Missing business-rule validation (schema is syntactically valid but semantically wrong)" (doc's own heading)
> A percentage coupon with discountValue: 999999 passes schema validation. A plan with intervalCount: 999999999 passes validation and only fails later (if at all) during date arithmetic, likely as an unhandled 500.

Location: coupon.validator.ts (discountValue: z.number().int().positive(), no upper bound, not cross-validated against discountType); subscription.validator.ts / plan.validator.ts (trialDays, intervalCount unbounded positive integers)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Add .refine() cross-field checks (percentage ≤ 100) and sane upper bounds on all of these.

Acceptance Criteria:
- coupon.validator.ts (discountValue: z.number().int().positive(), no upper bound, not cross-validated against discountType); subscription.validator.ts / plan.validator.ts (trialDays, intervalCount unbounded positive integers) is updated so that: Add .refine() cross-field checks (percentage ≤ 100) and sane upper bounds on all of these.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-010-missing-business-rule-validation-schemas-syntactically`
---

---
**[APISEC-011] change-plan endpoint parses and discards its input, returns the unchanged subscription**
Priority: P1
Category: architecture concern
Source Doc: API Security & Architecture Review, §2.5

Source Finding:
> "change-plan endpoint doesn't change the plan" (doc's own heading)
> The validated changePlanSchema input (newPlanId, immediate) is parsed and then discarded — the handler re-fetches and returns the unchanged subscription with a 200.

Location: subscription.routes.ts — POST /:id/change-plan
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (none proposed beyond the framing that this needs to actually change the plan or fail loudly)

Acceptance Criteria:
- subscription.routes.ts — POST /:id/change-plan is updated so that: (none proposed beyond the framing that this needs to actually change the plan or fail loudly)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Same finding independently identified in ARCH-007 and PAR-010; severities agree (all High).

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-011-change-plan-endpoint-parses-and-discards`
---

---
**[APISEC-012] Access-log middleware only fires on the happy path**
Priority: P2
Category: error-handling gap
Source Doc: API Security & Architecture Review, §3.1 (table)

Source Finding:
> "Access-log middleware only fires on the happy path" (table entry)
> Any thrown DomainError (401/403/404/422 — i.e. most real-world traffic) skips the access log entirely and only gets errorHandler's differently-shaped logger.error line.

Location: middleware/logger.ts — logger.info(...) runs after await next()
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (none proposed beyond the implied fix of logging regardless of outcome)

Acceptance Criteria:
- middleware/logger.ts — logger.info(...) runs after await next() is updated so that: (none proposed beyond the implied fix of logging regardless of outcome)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-012-access-log-middleware-only-fires-on`
---

---
**[APISEC-013] Client-controlled, unvalidated `X-Request-ID` header**
Priority: P2
Category: request-response mismatch
Source Doc: API Security & Architecture Review, §3.2 (table)

Source Finding:
> "Client-controlled, unvalidated X-Request-ID" (table entry)
> Accepts and echoes any client-supplied value with no format/length check.

Location: middleware/request-id.ts
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (none proposed beyond an implied validation/length cap)

Acceptance Criteria:
- middleware/request-id.ts is updated so that: (none proposed beyond an implied validation/length cap)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-013-client-controlled-unvalidated-x-request-id`
---

---
**[APISEC-014] Inconsistent pagination validation across list endpoints**
Priority: P2
Category: request-response mismatch
Source Doc: API Security & Architecture Review, §3.3 (table)

Source Finding:
> "Inconsistent pagination validation" (table entry)
> ?limit=abc → NaN flows straight to the DB layer unsanitized on 3 of 4 list endpoints; inconsistent pattern across an otherwise-consistent codebase.

Location: customer.routes.ts, subscription.routes.ts, invoice.routes.ts (raw parseInt(...) for limit/offset); plan.routes.ts (proper zValidator('query', ...) schema)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (none proposed beyond aligning all four routes to the plan.routes.ts pattern)

Acceptance Criteria:
- customer.routes.ts, subscription.routes.ts, invoice.routes.ts (raw parseInt(...) for limit/offset); plan.routes.ts (proper zValidator('query', ...) schema) is updated so that: (none proposed beyond aligning all four routes to the plan.routes.ts pattern)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-014-inconsistent-pagination-validation-across-list-endpoints`
---

---
**[APISEC-015] DELETE /payment-methods/:pmId ignores :customerId in the path**
Priority: P2
Category: request-response mismatch
Source Doc: API Security & Architecture Review, §3.4 (table)

Source Finding:
> "DELETE /payment-methods/:pmId ignores :customerId in the path" (table entry)
> Not a cross-tenant IDOR (tenant is still checked), but the URL implies a customer-scoped delete that isn't actually enforced — misleading contract.

Location: payment-method.routes.ts
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (none proposed beyond enforcing the implied customerId scoping or removing it from the path)

Acceptance Criteria:
- payment-method.routes.ts is updated so that: (none proposed beyond enforcing the implied customerId scoping or removing it from the path)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-015-delete-payment-methods-pmid-ignores-customerid`
---

---
**[APISEC-016] No request body size limit before signature verification on public webhook endpoints**
Priority: P2
Category: error-handling gap
Source Doc: API Security & Architecture Review, §3.5 (table)

Source Finding:
> "No request body size limit before signature verification" (table entry)
> Unauthenticated large-payload DoS vector on the two public webhook endpoints.

Location: nomba-webhook.ts, nomba.ts — both call c.req.text() unconditionally on unauthenticated public endpoints before any check
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (none proposed beyond an implied body-size limit before parsing)

Acceptance Criteria:
- nomba-webhook.ts, nomba.ts — both call c.req.text() unconditionally on unauthenticated public endpoints before any check is updated so that: (none proposed beyond an implied body-size limit before parsing)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-016-no-request-body-size-limit-before`
---

---
**[APISEC-017] No timeout on outbound webhook delivery**
Priority: P2
Category: error-handling gap
Source Doc: API Security & Architecture Review, §3.6 (table)

Source Finding:
> "No timeout on outbound webhook delivery" (table entry)
> One slow/hanging tenant endpoint can stall a batch of 50 deliveries, delaying every other tenant's webhooks (noisy-neighbor DoS).

Location: webhooks/outbound/delivery.ts — fetch(endpoint.url, ...) has no AbortSignal/timeout
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (none proposed beyond an implied AbortSignal/timeout)

Acceptance Criteria:
- webhooks/outbound/delivery.ts — fetch(endpoint.url, ...) has no AbortSignal/timeout is updated so that: (none proposed beyond an implied AbortSignal/timeout)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-017-no-timeout-on-outbound-webhook-delivery`
---

---
**[APISEC-018] Full Nomba error response body logged at error level, unredacted**
Priority: P2
Category: config issue
Source Doc: API Security & Architecture Review, §3.7 (table)

Source Finding:
> "Full Nomba error response body logged at error level" (table entry)
> Payment-processor error bodies can contain tokens/account identifiers; logged without redaction.

Location: nomba/client.ts — logger.error({ ..., errorBody }, ...)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (none proposed beyond an implied redaction step before logging)

Acceptance Criteria:
- nomba/client.ts — logger.error({ ..., errorBody }, ...) is updated so that: (none proposed beyond an implied redaction step before logging)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-018-full-nomba-error-response-body-logged`
---

---
**[APISEC-019] No automated cross-tenant (IDOR) test coverage**
Priority: P2
Category: —
Source Doc: API Security & Architecture Review, §3.8 (table)

Source Finding:
> "No automated cross-tenant (IDOR) tests" (table entry)
> Every route consistently threads tenant.id into service calls, which is the right pattern — but nothing in the provided test suite actually asserts tenant B can't read/modify tenant A's resources, so tenant isolation is trusted, not verified.

Location: tests/**
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (none proposed beyond an implied addition of explicit cross-tenant IDOR tests)

Acceptance Criteria:
- tests/** is updated so that: (none proposed beyond an implied addition of explicit cross-tenant IDOR tests)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Doc explicitly frames this as "trusted, not verified" rather than a confirmed bug.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-019-no-automated-cross-tenant-idor-test`
---

---
**[APISEC-020] Docs-vs-reality drift on rate limits and idempotency keys**
Priority: P3
Category: config issue
Source Doc: API Security & Architecture Review, §4

Source Finding:
> "Docs vs. reality drift is the most damaging DX issue here: the API reference confidently documents rate limits and idempotency keys that don't exist."
> An integrator who builds "safe retry" logic per the docs will ship duplicate-charge bugs in production.

Location: docs/api-reference.md
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Fix the drift before publishing the docs, not after.

Acceptance Criteria:
- docs/api-reference.md is updated so that: Fix the drift before publishing the docs, not after.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Same underlying gaps as APISEC-002, APISEC-003, restated here as a docs-trust issue.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-020-docs-vs-reality-drift-on-rate`
---

---
**[APISEC-021] List response envelopes carry no pagination metadata**
Priority: P3
Category: request-response mismatch
Source Doc: API Security & Architecture Review, §4

Source Finding:
> "List response envelopes carry no pagination metadata"
> Endpoints accept limit/offset but return a bare { customers: [...] } with no total/hasMore/nextOffset, so clients can't tell if they've reached the end.

Location: (list endpoints generally)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (none proposed beyond adding pagination metadata to list responses)

Acceptance Criteria:
- (list endpoints generally) is updated so that: (none proposed beyond adding pagination metadata to list responses)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-021-list-response-envelopes-carry-no-pagination`
---

---
**[APISEC-022] 404 semantics are inconsistent across endpoints**
Priority: P3
Category: request-response mismatch
Source Doc: API Security & Architecture Review, §4

Source Finding:
> "404 semantics are inconsistent"
> GET /customers?email= explicitly returns { customer: null } with a 404, while GET /customers/:id just returns whatever getCustomer resolves to — behavior for a missing ID isn't visible in this bundle.

Location: GET /customers?email= vs GET /customers/:id
Fix: Single option in source (de facto chosen — no ambiguity to resolve): Make uniform: always 404 with a structured error body, never a 200 with a null resource.

Acceptance Criteria:
- GET /customers?email= vs GET /customers/:id is updated so that: Make uniform: always 404 with a structured error body, never a 200 with a null resource.
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Conflict Note: Doc notes GET /customers/:id's actual missing-ID behavior "isn't visible in this bundle."

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-022-404-semantics-are-inconsistent-across-endpoints`
---

---
**[APISEC-023] Versioning is path-only, with no deprecation/sunset story**
Priority: P3
Category: —
Source Doc: API Security & Architecture Review, §4

Source Finding:
> "Versioning is path-only (/v1), with no deprecation/sunset headers and no Sunset/Deprecation story for a future /v2"
> No deprecation-header mechanism exists — fine for now per the doc, but flagged as worth a plan before the first breaking change.

Location: (API versioning generally)
Fix: Single option in source (de facto chosen — no ambiguity to resolve): (none proposed — flagged as forward-looking, not an active bug)

Acceptance Criteria:
- (API versioning generally) is updated so that: (none proposed — flagged as forward-looking, not an active bug)
- Behavior no longer matches the deviation described in Current Behavior above; system now satisfies the Source Requirement above.

Suggested branch (not created — branch creation skipped per your request): `fix/APISEC-023-versioning-is-path-only-with-no`
---
## 4. Mandatory Self-Audit

- Rows eligible for processing (Ticket-eligible = Yes, Status Open/Needs-Info): **77**
- Stop-and-present rows (PAR-001, PAR-010, PAR-011): **3** (fixed, always these three)
- Normal tickets generated: **74**
- Branches created: **0** — branch creation was skipped per your instruction; 74 suggested branch names are listed inline on each ticket for manual creation instead
- Excluded (superseded): **8** — ARCH-005, ARCH-009, ARCH-015, ARCH-017, PAR-009, PAR-012, APISEC-005, APISEC-028
- Reconciliation: 77 eligible = 3 (stop-and-present) + 74 (normal tickets). **Matches — nothing unaccounted for.**

Breakdown by prefix (eligible rows only):

| Prefix | Eligible | Normal tickets | Stop-and-present | Excluded (superseded) | Compliant (out of scope) |
|---|---|---|---|---|---|
| SEC | 26 | 26 | 0 | 0 | 7 (014,015,016,017,019,020,033) |
| ARCH | 14 | 14 | 0 | 4 (005,009,015,017) | 0 |
| PAR | 15 | 12 | 3 (001,010,011) | 2 (009,012) | 0 |
| APISEC | 22 | 22 | 0 | 2 (005,028) | 5 (024,025,026,027,029) |
| **Total** | **77** | **74** | **3** | **8** | **12** |

77 + 8 + 12 = 97 — matches the register's total of 97 source findings across all prefixes.
