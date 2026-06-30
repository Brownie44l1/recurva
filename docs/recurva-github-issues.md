# Recurva (RCV) — GitHub Issues Backlog

> **Stack:** Bun + Hono + PostgreSQL (postgres.js) + Zod  
> **Total Estimated Time:** ~58 hours across 7 days  
> **Convention:** All branches prefix `feat/RCV-NNN-slug`; labels follow `epic:[name]` + `type:[feat|chore|test|fix|docs]`

---

## EPIC 1: PROJECT FOUNDATION

---

**EPIC:** Project Foundation
**ISSUE #RCV-001:** Repo init, folder structure, and environment config
**Branch:** `feat/RCV-001-repo-init`
**Labels:** `epic:foundation`, `type:chore`
**Blocked by:** none

**Description:**
Initialize the GitHub repository with a Bun project, establish the canonical folder structure (`src/`, `migrations/`, `tests/`, `scripts/`), and set up `.env.example` with all required environment variable keys. This is the foundation every other ticket builds on — no other work begins until this is done.

**Acceptance Criteria:**
- [ ] `bun init` completed; `package.json` reflects project name `recurva`
- [ ] Folder structure matches spec: `src/{routes,middleware,services,db,lib}`, `migrations/`, `tests/`, `scripts/`
- [ ] `.env.example` documents all required vars (DATABASE_URL, PORT, JWT_SECRET, NOMBA_*, etc.)
- [ ] `.gitignore` excludes `node_modules`, `.env`, `dist/`
- [ ] `README.md` placeholder committed

**Test Requirements:**
- [ ] None at this stage (pure scaffolding)

**Estimated Time:** 0.5 hours

---

**EPIC:** Project Foundation
**ISSUE #RCV-002:** Docker setup (app + PostgreSQL)
**Branch:** `feat/RCV-002-docker-setup`
**Labels:** `epic:foundation`, `type:chore`
**Blocked by:** #RCV-001

**Description:**
Create a `Dockerfile` for the Bun application and a `docker-compose.yml` that orchestrates the app container alongside a PostgreSQL 16 container. This enables fully reproducible local development and mirrors the production topology.

**Acceptance Criteria:**
- [ ] `Dockerfile` uses official `oven/bun` base image; multi-stage build for production
- [ ] `docker-compose.yml` defines `app` and `postgres` services with health checks
- [ ] `postgres` service persists data via a named volume
- [ ] `bun run dev` inside the container hot-reloads on file changes
- [ ] `docker compose up` starts the full stack with no manual steps

**Test Requirements:**
- [ ] Verify `docker compose up` reaches healthy status end-to-end

**Estimated Time:** 1 hour

---

**EPIC:** Project Foundation
**ISSUE #RCV-003:** postgres.js connection pool and DB module
**Branch:** `feat/RCV-003-db-connection`
**Labels:** `epic:foundation`, `type:feat`
**Blocked by:** #RCV-002

**Description:**
Configure and export a singleton `postgres.js` connection pool as `src/db/client.ts`. Define connection options (max connections, idle timeout, SSL toggle) driven by environment variables. This module is imported by every service layer query.

**Acceptance Criteria:**
- [ ] `src/db/client.ts` exports a typed `sql` instance from `postgres`
- [ ] Pool settings configurable via env vars (`DB_MAX_CONNECTIONS`, `DB_IDLE_TIMEOUT`)
- [ ] Graceful shutdown hook closes pool on `SIGTERM`/`SIGINT`
- [ ] SSL enabled when `NODE_ENV=production`

**Test Requirements:**
- [ ] Integration test: connect, run `SELECT 1`, assert result

**Estimated Time:** 0.5 hours

---

**EPIC:** Project Foundation
**ISSUE #RCV-004:** Migration runner script
**Branch:** `feat/RCV-004-migration-runner`
**Labels:** `epic:foundation`, `type:chore`
**Blocked by:** #RCV-003

**Description:**
Build a lightweight migration runner in `scripts/migrate.ts` that reads numbered `.sql` files from `migrations/`, tracks applied migrations in a `schema_migrations` table, and applies new ones in order. Keeps full control without adding an ORM migration dependency.

**Acceptance Criteria:**
- [ ] `schema_migrations` table created automatically on first run
- [ ] Runner applies only unapplied migrations in filename order
- [ ] `bun run migrate` executes runner; `bun run migrate:rollback` reverts last migration
- [ ] Migration filenames follow `NNN_description.sql` convention

**Test Requirements:**
- [ ] Unit test: idempotent — running runner twice applies each migration once only

**Estimated Time:** 1 hour

---

**EPIC:** Project Foundation
**ISSUE #RCV-005:** Hono app bootstrap and server entrypoint
**Branch:** `feat/RCV-005-hono-bootstrap`
**Labels:** `epic:foundation`, `type:feat`
**Blocked by:** #RCV-003

**Description:**
Create the main Hono application in `src/app.ts` and a server entrypoint `src/index.ts` that binds to a configurable port. Mount a root router and apply global middleware ordering. This is the skeleton all route groups plug into.

**Acceptance Criteria:**
- [ ] `src/index.ts` starts Bun HTTP server; port read from `PORT` env var (default 3000)
- [ ] Hono app instance exported from `src/app.ts` for testability
- [ ] 404 and global error handler registered
- [ ] Server logs `Recurva listening on :PORT` at startup

**Test Requirements:**
- [ ] Integration test: `GET /` returns 404 with JSON error body

**Estimated Time:** 0.5 hours

---

**EPIC:** Project Foundation
**ISSUE #RCV-006:** Request ID middleware
**Branch:** `feat/RCV-006-request-id`
**Labels:** `epic:foundation`, `type:feat`
**Blocked by:** #RCV-005

**Description:**
Implement a middleware that generates a `uuid v4` request ID for every incoming request, attaches it to the Hono context, and echoes it in the `X-Request-ID` response header. Enables end-to-end tracing across logs and external systems.

**Acceptance Criteria:**
- [ ] Middleware reads `X-Request-ID` header if present; generates one if absent
- [ ] Request ID stored on Hono context as `c.var.requestId`
- [ ] `X-Request-ID` present on every response
- [ ] Middleware registered before all route handlers

**Test Requirements:**
- [ ] Unit test: absent header → ID generated; present header → ID echoed

**Estimated Time:** 0.5 hours

---

**EPIC:** Project Foundation
**ISSUE #RCV-007:** Structured logging middleware
**Branch:** `feat/RCV-007-structured-logging`
**Labels:** `epic:foundation`, `type:feat`
**Blocked by:** #RCV-006

**Description:**
Add request/response logging middleware using a structured JSON logger (pino or equivalent Bun-compatible logger). Every request logs method, path, status, duration, and request ID. Log level driven by `LOG_LEVEL` env var.

**Acceptance Criteria:**
- [ ] Logs emit valid JSON with fields: `time`, `level`, `requestId`, `method`, `path`, `status`, `durationMs`
- [ ] `LOG_LEVEL` env var controls verbosity (default `info`)
- [ ] Sensitive headers (`Authorization`) are redacted from logs
- [ ] Errors include `err.message` and `err.stack` in log payload

**Test Requirements:**
- [ ] Unit test: log output contains all required fields on a successful request

**Estimated Time:** 0.5 hours

---

**EPIC:** Project Foundation
**ISSUE #RCV-008:** Health check endpoint
**Branch:** `feat/RCV-008-health-check`
**Labels:** `epic:foundation`, `type:feat`
**Blocked by:** #RCV-005, #RCV-003

**Description:**
Implement `GET /health` that verifies application and database liveness. Returns a structured JSON response indicating service status and DB connectivity. Used by Docker health checks, load balancers, and CI smoke tests.

**Acceptance Criteria:**
- [ ] `GET /health` returns `200` with `{ status: "ok", db: "ok", uptime: N }`
- [ ] Returns `503` with `{ status: "degraded", db: "error" }` if DB unreachable
- [ ] Endpoint requires no authentication
- [ ] Response time < 200ms under normal conditions

**Test Requirements:**
- [ ] Integration test: DB healthy → 200; DB down → 503

**Estimated Time:** 0.5 hours

---

**EPIC:** Project Foundation
**ISSUE #RCV-009:** GitHub Actions CI skeleton
**Branch:** `feat/RCV-009-ci-skeleton`
**Labels:** `epic:foundation`, `type:chore`
**Blocked by:** #RCV-008

**Description:**
Create `.github/workflows/ci.yml` that runs on every PR and push to `main`. Pipeline installs Bun, spins up a PostgreSQL service container, runs migrations, and executes the full test suite. Blocks merges on failure.

**Acceptance Criteria:**
- [ ] Workflow triggers on `push` to `main` and `pull_request`
- [ ] PostgreSQL service container matches production version (16)
- [ ] `bun test` runs all tests; non-zero exit fails the pipeline
- [ ] Workflow completes in under 3 minutes on a standard runner
- [ ] Branch protection rule requires CI to pass before merge

**Test Requirements:**
- [ ] Verify workflow passes on a clean branch from `main`

**Estimated Time:** 1 hour

---

## EPIC 2: TENANT MANAGEMENT

---

**EPIC:** Tenant Management
**ISSUE #RCV-010:** Tenant DB schema and migration
**Branch:** `feat/RCV-010-tenant-schema`
**Labels:** `epic:tenants`, `type:feat`
**Blocked by:** #RCV-004

**Description:**
Write and apply the migration that creates the `tenants` table with all required columns: id (UUID), name, email, hashed API key, test/live mode flag, Nomba credentials, webhook URL, timestamps, and soft-delete. Schema correctness here underpins the entire multi-tenant architecture.

**Acceptance Criteria:**
- [ ] `tenants` table created with correct column types and NOT NULL constraints
- [ ] Unique index on `email`
- [ ] `mode` column is enum `test | live` with default `test`
- [ ] Timestamps: `created_at` (default NOW()), `updated_at`, `deleted_at` (nullable)

**Test Requirements:**
- [ ] Migration applies and rolls back cleanly

**Estimated Time:** 0.5 hours

---

**EPIC:** Tenant Management
**ISSUE #RCV-011:** Tenant registration endpoint
**Branch:** `feat/RCV-011-tenant-registration`
**Labels:** `epic:tenants`, `type:feat`
**Blocked by:** #RCV-010

**Description:**
Implement `POST /v1/tenants/register` that accepts tenant name, email, and Nomba credentials, generates a raw API key with `rk_live_` prefix, hashes it with bcrypt, stores the hash, and returns the raw key once (never again). Tenants are created in `test` mode by default.

**Acceptance Criteria:**
- [ ] Zod schema validates request body; 422 on invalid input
- [ ] Raw API key format: `rk_live_<32-char-random-hex>`
- [ ] bcrypt hash (cost factor 12) stored; raw key returned in response and never persisted
- [ ] Duplicate email returns 409 with descriptive error
- [ ] Response includes tenant ID, name, email, mode, and the raw API key

**Test Requirements:**
- [ ] Unit test: key format regex matches; hash verifies against raw key
- [ ] Integration test: registration succeeds; duplicate email returns 409

**Estimated Time:** 1 hour

---

**EPIC:** Tenant Management
**ISSUE #RCV-012:** API key authentication middleware
**Branch:** `feat/RCV-012-api-key-auth`
**Labels:** `epic:tenants`, `type:feat`
**Blocked by:** #RCV-011

**Description:**
Implement middleware that reads the `Authorization: Bearer rk_live_...` header, hashes the provided key, performs a constant-time lookup against all tenant hashes, and injects the resolved tenant into Hono context as `c.var.tenant`. Missing or invalid keys return 401.

**Acceptance Criteria:**
- [ ] Timing-safe comparison used for hash lookup (prevents enumeration)
- [ ] `c.var.tenant` typed as full tenant record
- [ ] Missing header → 401 `{ error: "missing_api_key" }`
- [ ] Invalid key → 401 `{ error: "invalid_api_key" }`
- [ ] Soft-deleted tenants rejected with 401

**Test Requirements:**
- [ ] Unit test: valid key → tenant resolved; invalid key → null
- [ ] Integration test: protected route rejects missing/invalid keys; accepts valid key

**Estimated Time:** 1 hour

---

**EPIC:** Tenant Management
**ISSUE #RCV-013:** Tenant test vs live mode toggle
**Branch:** `feat/RCV-013-tenant-mode`
**Labels:** `epic:tenants`, `type:feat`
**Blocked by:** #RCV-012

**Description:**
Implement `PATCH /v1/tenants/mode` (auth required) that allows a tenant to switch between `test` and `live` mode. In test mode, Nomba calls are routed to the sandbox environment. Mode is included in all billing and audit records.

**Acceptance Criteria:**
- [ ] `PATCH /v1/tenants/mode` accepts `{ mode: "test" | "live" }`
- [ ] Mode persisted; all subsequent Nomba client calls use the correct environment URL
- [ ] `GET /v1/tenants/me` returns current mode
- [ ] Mode included in all outbound webhook payloads

**Test Requirements:**
- [ ] Integration test: toggle live → test → live; Nomba client uses correct base URL per mode

**Estimated Time:** 0.5 hours

---

## EPIC 3: PLAN MANAGEMENT

---

**EPIC:** Plan Management
**ISSUE #RCV-014:** Plan DB schema and migration
**Branch:** `feat/RCV-014-plan-schema`
**Labels:** `epic:plans`, `type:feat`
**Blocked by:** #RCV-010

**Description:**
Create the `plans` and `plan_prices` migrations. `plans` stores metadata, billing interval, and type (`fixed | metered`). `plan_prices` stores per-currency unit amounts, enabling multi-currency pricing without denormalisation.

**Acceptance Criteria:**
- [ ] `plans` table: id, tenant_id (FK), name, description, interval (`monthly|yearly`), type, archived_at
- [ ] `plan_prices` table: plan_id (FK), currency (`NGN|USD|GBP|EUR`), unit_amount (integer cents/kobo), metered_aggregate (`sum|max|last`)
- [ ] Composite unique index on `(plan_id, currency)`
- [ ] Cascading delete from plan to plan_prices

**Test Requirements:**
- [ ] Migration applies and rolls back cleanly

**Estimated Time:** 0.5 hours

---

**EPIC:** Plan Management
**ISSUE #RCV-015:** Plan CRUD endpoints
**Branch:** `feat/RCV-015-plan-crud`
**Labels:** `epic:plans`, `type:feat`
**Blocked by:** #RCV-014, #RCV-012

**Description:**
Implement `POST`, `GET /:id`, `PATCH /:id`, and `GET /` (list) endpoints under `/v1/plans`. All operations are tenant-scoped via the auth middleware. Zod schemas enforce all input. Listing supports `type` and `archived` filter query params.

**Acceptance Criteria:**
- [ ] `POST /v1/plans` creates plan + at least one price; returns 201
- [ ] `GET /v1/plans/:id` returns plan with all currency prices; 404 if not found or wrong tenant
- [ ] `PATCH /v1/plans/:id` allows updating name, description; prices updated via upsert
- [ ] `GET /v1/plans` supports `?type=metered&archived=false`; paginated (limit/offset)
- [ ] Zod schemas cover all input; invalid input → 422

**Test Requirements:**
- [ ] Integration tests: full CRUD lifecycle; cross-tenant access returns 404

**Estimated Time:** 1.5 hours

---

**EPIC:** Plan Management
**ISSUE #RCV-016:** Plan archiving
**Branch:** `feat/RCV-016-plan-archive`
**Labels:** `epic:plans`, `type:feat`
**Blocked by:** #RCV-015

**Description:**
Implement `DELETE /v1/plans/:id` as a soft-archive operation (sets `archived_at`). Archived plans cannot be used for new subscriptions but existing subscriptions on the plan continue billing. Prevents breaking live subscriptions by deleting a plan.

**Acceptance Criteria:**
- [ ] `DELETE /v1/plans/:id` sets `archived_at = NOW()`; returns 200 with updated plan
- [ ] Archived plans excluded from default list unless `?archived=true`
- [ ] Attempting to create a subscription on an archived plan returns 422
- [ ] Attempting to archive a plan with active subscriptions returns a warning (not blocked)

**Test Requirements:**
- [ ] Integration test: archive plan → verify excluded from default list; warning on active subscriptions

**Estimated Time:** 0.5 hours

---

## EPIC 4: COUPON ENGINE

---

**EPIC:** Coupon Engine
**ISSUE #RCV-017:** Coupon DB schema and migration
**Branch:** `feat/RCV-017-coupon-schema`
**Labels:** `epic:coupons`, `type:feat`
**Blocked by:** #RCV-010

**Description:**
Create the `coupons` migration. Stores coupon code, type (`percentage | fixed`), discount value, duration (`once | repeating | forever`), duration months (for repeating), usage limit, redemption count, expiry date, and tenant scope.

**Acceptance Criteria:**
- [ ] `coupons` table: id, tenant_id (FK), code (unique per tenant), type, amount, currency (nullable for %, required for fixed), duration, duration_months, max_redemptions, redemption_count, expires_at, created_at, archived_at
- [ ] Unique index on `(tenant_id, code)`
- [ ] `redemption_count` has DB-level CHECK >= 0

**Test Requirements:**
- [ ] Migration applies and rolls back cleanly

**Estimated Time:** 0.5 hours

---

**EPIC:** Coupon Engine
**ISSUE #RCV-018:** Coupon CRUD endpoints
**Branch:** `feat/RCV-018-coupon-crud`
**Labels:** `epic:coupons`, `type:feat`
**Blocked by:** #RCV-017, #RCV-012

**Description:**
Implement coupon management endpoints: create, retrieve, list, and archive. Tenant-scoped. Zod validation enforces business rules (e.g. `fixed` type requires a currency, `duration_months` required when `duration=repeating`).

**Acceptance Criteria:**
- [ ] `POST /v1/coupons` creates coupon; validates type-specific fields
- [ ] `GET /v1/coupons/:id` returns coupon; 404 for wrong tenant
- [ ] `GET /v1/coupons` lists with pagination; supports `?active=true` filter
- [ ] `DELETE /v1/coupons/:id` soft-archives (sets `archived_at`)

**Test Requirements:**
- [ ] Integration test: fixed coupon missing currency → 422; repeating missing duration_months → 422

**Estimated Time:** 1 hour

---

**EPIC:** Coupon Engine
**ISSUE #RCV-019:** Coupon validation service
**Branch:** `feat/RCV-019-coupon-validation`
**Labels:** `epic:coupons`, `type:feat`
**Blocked by:** #RCV-018

**Description:**
Implement a `validateCoupon(code, tenantId, currency)` service function used at subscription creation and invoice generation time. Checks: not archived, not expired, usage limit not exceeded, currency compatibility for fixed coupons. Returns a typed discount descriptor or throws a structured error.

**Acceptance Criteria:**
- [ ] Expired coupon → `CouponExpiredError`
- [ ] Usage limit hit → `CouponExhaustedError`
- [ ] Currency mismatch for fixed type → `CouponCurrencyMismatchError`
- [ ] Archived coupon → `CouponNotFoundError`
- [ ] Valid coupon → returns `{ type, amount, currency, duration, durationMonths }`

**Test Requirements:**
- [ ] Unit tests for each error path
- [ ] Unit test: valid coupon returns correct descriptor

**Estimated Time:** 1 hour

---

**EPIC:** Coupon Engine
**ISSUE #RCV-020:** Coupon application to invoice line item
**Branch:** `feat/RCV-020-coupon-application`
**Labels:** `epic:coupons`, `type:feat`
**Blocked by:** #RCV-019

**Description:**
Implement `applyCouponToInvoice(invoice, couponDescriptor)` that computes the discount amount, adds a `discount` line item to the invoice, and returns the adjusted total. For `once` duration, marks the coupon-subscription link as consumed after application. Handles rounding for fixed discounts in minor currency units.

**Acceptance Criteria:**
- [ ] Percentage discount: `floor(subtotal * rate)` with no negative totals (minimum 0)
- [ ] Fixed discount: subtracted from subtotal; minimum invoice total is 0
- [ ] `once` duration: coupon marked consumed; not applied on next invoice
- [ ] `repeating` duration: applied for `duration_months` billing cycles
- [ ] Discount line item recorded on invoice with coupon code reference

**Test Requirements:**
- [ ] Unit tests: percentage, fixed, once, repeating, floor-to-zero edge case

**Estimated Time:** 1 hour

---

## EPIC 5: CUSTOMER MANAGEMENT

---

**EPIC:** Customer Management
**ISSUE #RCV-021:** Customer DB schema and migration
**Branch:** `feat/RCV-021-customer-schema`
**Labels:** `epic:customers`, `type:feat`
**Blocked by:** #RCV-010

**Description:**
Create the `customers` table migration. Customers are tenant-scoped, identified by email within a tenant, and support arbitrary JSONB metadata. This is the anchor record for subscriptions and payment methods.

**Acceptance Criteria:**
- [ ] `customers` table: id, tenant_id (FK), email, name, phone, metadata (JSONB, default `{}`), created_at, updated_at, deleted_at
- [ ] Unique index on `(tenant_id, email)`
- [ ] Soft-delete pattern via `deleted_at`

**Test Requirements:**
- [ ] Migration applies and rolls back cleanly

**Estimated Time:** 0.5 hours

---

**EPIC:** Customer Management
**ISSUE #RCV-022:** Customer CRUD endpoints
**Branch:** `feat/RCV-022-customer-crud`
**Labels:** `epic:customers`, `type:feat`
**Blocked by:** #RCV-021, #RCV-012

**Description:**
Implement customer management endpoints under `/v1/customers`. All operations tenant-scoped. Supports lookup by email via query param. Metadata field is a free-form JSONB merge-patch on update.

**Acceptance Criteria:**
- [ ] `POST /v1/customers` creates customer; 409 on duplicate email within tenant
- [ ] `GET /v1/customers/:id` returns customer with payment method count
- [ ] `GET /v1/customers?email=...` exact-match lookup by email
- [ ] `GET /v1/customers` paginated list (limit/offset)
- [ ] `PATCH /v1/customers/:id` deep-merges metadata; updates name/phone
- [ ] `DELETE /v1/customers/:id` soft-deletes; returns 409 if active subscriptions exist

**Test Requirements:**
- [ ] Integration tests: full CRUD; cross-tenant isolation; duplicate email → 409

**Estimated Time:** 1 hour

---

## EPIC 6: PAYMENT METHOD MANAGEMENT

---

**EPIC:** Payment Method Management
**ISSUE #RCV-023:** Payment method DB schema and migration
**Branch:** `feat/RCV-023-payment-method-schema`
**Labels:** `epic:payment-methods`, `type:feat`
**Blocked by:** #RCV-021

**Description:**
Create the `payment_methods` table that stores tokenised card references from Nomba (not raw card data). Supports multiple methods per customer with a `is_primary` and `is_backup` flag pair. This schema must never store raw PANs.

**Acceptance Criteria:**
- [ ] `payment_methods` table: id, customer_id (FK), tenant_id (FK), nomba_token, last4, brand, exp_month, exp_year, is_primary (bool), is_backup (bool), created_at, removed_at
- [ ] Partial unique index: only one `is_primary = true` per customer (DB constraint)
- [ ] Partial unique index: only one `is_backup = true` per customer

**Test Requirements:**
- [ ] Migration applies; DB constraint rejects two primary cards for same customer

**Estimated Time:** 0.5 hours

---

**EPIC:** Payment Method Management
**ISSUE #RCV-024:** Payment method management endpoints
**Branch:** `feat/RCV-024-payment-method-crud`
**Labels:** `epic:payment-methods`, `type:feat`
**Blocked by:** #RCV-023, #RCV-012

**Description:**
Implement endpoints for listing, designating primary/backup, and removing payment methods. Card addition is handled via the Nomba checkout callback (Epic 7), not directly here. Removal enforces: cannot remove primary if it's the only method and an active subscription exists.

**Acceptance Criteria:**
- [ ] `GET /v1/customers/:id/payment-methods` lists all methods for customer
- [ ] `PATCH /v1/customers/:id/payment-methods/:pmId/primary` promotes to primary (demotes old primary)
- [ ] `PATCH /v1/customers/:id/payment-methods/:pmId/backup` designates backup
- [ ] `DELETE /v1/customers/:id/payment-methods/:pmId` soft-removes; guards against orphaning active subscription

**Test Requirements:**
- [ ] Integration test: promote primary → old primary demoted atomically; removal guard fires correctly

**Estimated Time:** 1 hour

---

## EPIC 7: NOMBA INTEGRATION LAYER

---

**EPIC:** Nomba Integration Layer
**ISSUE #RCV-025:** Nomba HTTP client with per-tenant credentials
**Branch:** `feat/RCV-025-nomba-client`
**Labels:** `epic:nomba`, `type:feat`
**Blocked by:** #RCV-013

**Description:**
Build `src/lib/nomba-client.ts` — a typed HTTP client factory that accepts tenant Nomba credentials and constructs a client pointed at either the sandbox or production Nomba base URL based on tenant mode. All requests include auth headers and retry on 429 with exponential backoff.

**Acceptance Criteria:**
- [ ] `createNombaClient(tenant)` returns a typed client instance
- [ ] Base URL switches: `api.nomba.com` (live) vs `sandbox.nomba.com` (test)
- [ ] All requests attach `Authorization` and `accountId` headers
- [ ] 429 responses trigger 2 retries with exponential backoff before throwing
- [ ] Request/response pairs logged at `debug` level with request ID

**Test Requirements:**
- [ ] Unit test with mocked fetch: auth headers present; sandbox URL used in test mode

**Estimated Time:** 1 hour

---

**EPIC:** Nomba Integration Layer
**ISSUE #RCV-026:** Checkout session creation wrapper
**Branch:** `feat/RCV-026-nomba-checkout`
**Labels:** `epic:nomba`, `type:feat`
**Blocked by:** #RCV-025

**Description:**
Implement `createCheckoutSession(client, params)` that calls Nomba's checkout API, requesting card tokenisation on success. Returns a checkout URL for redirect-based card capture. Used during subscription creation to collect the first payment method.

**Acceptance Criteria:**
- [ ] Calls correct Nomba checkout endpoint with amount, currency, customer reference, and `tokenize: true`
- [ ] Returns `{ checkoutUrl, reference }` on success
- [ ] Nomba API errors mapped to typed `NombaCheckoutError` with original code preserved
- [ ] Reference stored in a `pending_checkouts` table for callback correlation

**Test Requirements:**
- [ ] Unit test: mocked Nomba response → checkout URL returned; error → typed error thrown

**Estimated Time:** 1 hour

---

**EPIC:** Nomba Integration Layer
**ISSUE #RCV-027:** Tokenised card capture from checkout callback
**Branch:** `feat/RCV-027-card-capture`
**Labels:** `epic:nomba`, `type:feat`
**Blocked by:** #RCV-026, #RCV-023

**Description:**
Implement the handler that processes Nomba's post-checkout callback, extracts the card token and metadata (last4, brand, expiry), and persists a `payment_method` record. Marks the checkout reference as consumed. Triggers subscription activation if this was a first-charge flow.

**Acceptance Criteria:**
- [ ] Callback verified via Nomba signature before processing
- [ ] Card token, last4, brand, exp_month, exp_year extracted and persisted
- [ ] `pending_checkouts` record marked `consumed = true`
- [ ] If first subscription charge: subscription moved to `active` state
- [ ] Idempotent: duplicate callback for same reference → no duplicate card record

**Test Requirements:**
- [ ] Integration test: valid callback → payment method created; duplicate → idempotent

**Estimated Time:** 1.5 hours

---

**EPIC:** Nomba Integration Layer
**ISSUE #RCV-028:** Charge API wrapper with error mapping
**Branch:** `feat/RCV-028-nomba-charge`
**Labels:** `epic:nomba`, `type:feat`
**Blocked by:** #RCV-025

**Description:**
Implement `chargeCard(client, token, amount, currency, idempotencyKey)` wrapping Nomba's tokenised card charge endpoint. Maps all Nomba failure codes to a typed error taxonomy (`InsufficientFundsError`, `CardDeclinedError`, `NetworkError`, etc.) used throughout the billing engine.

**Acceptance Criteria:**
- [ ] Sends idempotency key header to prevent double charges
- [ ] Returns `{ chargeId, status, amount, currency }` on success
- [ ] All documented Nomba error codes mapped to specific typed errors
- [ ] Unknown errors wrapped as `NombaUnknownError` with raw code preserved
- [ ] Charge attempt logged with full request/response at `info` level

**Test Requirements:**
- [ ] Unit tests for each error mapping path
- [ ] Unit test: idempotency key present in request headers

**Estimated Time:** 1 hour

---

**EPIC:** Nomba Integration Layer
**ISSUE #RCV-029:** Refund API wrapper
**Branch:** `feat/RCV-029-nomba-refund`
**Labels:** `epic:nomba`, `type:feat`
**Blocked by:** #RCV-025

**Description:**
Implement `refundCharge(client, chargeId, amount, reason)` for partial and full refunds. Used by the proration engine when issuing cancellation credits. Idempotent via a stored refund reference; duplicate calls return the existing refund record.

**Acceptance Criteria:**
- [ ] Calls Nomba refund endpoint with charge ID, amount, and reason
- [ ] Partial refund supported (amount < original charge)
- [ ] Refund record persisted in `refunds` table with status
- [ ] Duplicate refund attempt for same charge + amount → returns existing record (idempotent)

**Test Requirements:**
- [ ] Unit test: mocked success → refund record returned; duplicate → idempotent

**Estimated Time:** 1 hour

---

## EPIC 8: SUBSCRIPTION LIFECYCLE

---

**EPIC:** Subscription Lifecycle
**ISSUE #RCV-030:** Subscription DB schema and migration
**Branch:** `feat/RCV-030-subscription-schema`
**Labels:** `epic:subscriptions`, `type:feat`
**Blocked by:** #RCV-021, #RCV-014

**Description:**
Create the `subscriptions` migration. Stores all lifecycle state, plan reference, billing dates, coupon link, proration credit balance, and cancellation metadata. The state column is an enum representing the formal state machine states.

**Acceptance Criteria:**
- [ ] `subscriptions` table: id, tenant_id, customer_id, plan_id, status (enum), currency, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, paused_at, coupon_id (nullable), proration_credit (integer, default 0), created_at, updated_at
- [ ] Status enum: `incomplete | active | past_due | paused | cancelled`
- [ ] Index on `(tenant_id, status)` for billing scheduler queries

**Test Requirements:**
- [ ] Migration applies and rolls back cleanly

**Estimated Time:** 0.5 hours

---

**EPIC:** Subscription Lifecycle
**ISSUE #RCV-031:** Subscription state machine implementation
**Branch:** `feat/RCV-031-state-machine`
**Labels:** `epic:subscriptions`, `type:feat`
**Blocked by:** #RCV-030

**Description:**
Implement a formal state machine in `src/lib/subscription-fsm.ts` that defines valid state transitions and guards. All status changes must go through the FSM — no direct SQL updates. This enforces lifecycle correctness and makes illegal states unrepresentable.

**Acceptance Criteria:**
- [ ] Valid transitions: `incomplete→active`, `active→past_due`, `active→paused`, `active→cancelled`, `past_due→active`, `past_due→cancelled`, `paused→active`, `paused→cancelled`
- [ ] Invalid transitions throw `InvalidTransitionError` with `from` and `to` states
- [ ] `transition(subscription, event, payload?)` returns the new subscription record
- [ ] All transitions write an audit entry to `subscription_events` table

**Test Requirements:**
- [ ] Unit tests: every valid transition; every invalid transition throws

**Estimated Time:** 1.5 hours

---

**EPIC:** Subscription Lifecycle
**ISSUE #RCV-032:** Subscription creation with first charge trigger
**Branch:** `feat/RCV-032-subscription-create`
**Labels:** `epic:subscriptions`, `type:feat`
**Blocked by:** #RCV-031, #RCV-028, #RCV-026, #RCV-019

**Description:**
Implement `POST /v1/subscriptions`. If customer has a saved payment method, attempts immediate charge and activates subscription on success. If no payment method, creates a checkout session and returns the URL; subscription stays `incomplete` until card captured. Coupon validated and linked at creation time.

**Acceptance Criteria:**
- [ ] Zod schema validates: customer_id, plan_id, currency, optional coupon_code
- [ ] Saved card path: charge attempted → success → `active`; failure → `incomplete` with error
- [ ] Checkout path: checkout session URL returned; subscription in `incomplete`
- [ ] Coupon validated via #RCV-019 before subscription record created
- [ ] Idempotency key accepted via header to prevent duplicate subscriptions

**Test Requirements:**
- [ ] Integration test: saved card success flow; saved card failure flow; checkout URL flow

**Estimated Time:** 2 hours

---

**EPIC:** Subscription Lifecycle
**ISSUE #RCV-033:** Subscription query endpoints
**Branch:** `feat/RCV-033-subscription-queries`
**Labels:** `epic:subscriptions`, `type:feat`
**Blocked by:** #RCV-032

**Description:**
Implement retrieval endpoints: `GET /v1/subscriptions/:id`, `GET /v1/subscriptions` (tenant list), and `GET /v1/customers/:id/subscriptions` (customer-scoped list). All are tenant-scoped. List endpoints support status filter and pagination.

**Acceptance Criteria:**
- [ ] `GET /v1/subscriptions/:id` returns full subscription with plan and customer info; 404 for wrong tenant
- [ ] `GET /v1/subscriptions?status=active` filters by status
- [ ] `GET /v1/customers/:id/subscriptions` returns all subscriptions for a customer
- [ ] All lists paginated (limit/offset); default limit 20, max 100

**Test Requirements:**
- [ ] Integration test: cross-tenant isolation; status filter returns correct subset

**Estimated Time:** 0.5 hours

---

**EPIC:** Subscription Lifecycle
**ISSUE #RCV-034:** Subscription pause and resume
**Branch:** `feat/RCV-034-pause-resume`
**Labels:** `epic:subscriptions`, `type:feat`
**Blocked by:** #RCV-031

**Description:**
Implement `POST /v1/subscriptions/:id/pause` and `POST /v1/subscriptions/:id/resume`. Pause freezes the billing period; resume re-activates and adjusts the next billing date based on time paused. Only `active` subscriptions can be paused; only `paused` subscriptions can be resumed.

**Acceptance Criteria:**
- [ ] Pause: `paused_at` recorded; billing period frozen; state → `paused`
- [ ] Resume: `current_period_end` extended by pause duration; state → `active`
- [ ] Pausing an already-paused subscription → 422
- [ ] Pause/resume events written to `subscription_events`

**Test Requirements:**
- [ ] Integration test: pause then resume; verify billing dates adjusted correctly

**Estimated Time:** 1 hour

---

**EPIC:** Subscription Lifecycle
**ISSUE #RCV-035:** Subscription cancellation (immediate and end of period)
**Branch:** `feat/RCV-035-cancellation`
**Labels:** `epic:subscriptions`, `type:feat`
**Blocked by:** #RCV-031, #RCV-029

**Description:**
Implement `POST /v1/subscriptions/:id/cancel` with a `cancel_at_period_end` boolean. Immediate cancellation triggers proration credit calculation and optional refund. End-of-period sets the flag; billing engine respects it at next cycle cutoff.

**Acceptance Criteria:**
- [ ] Immediate cancel: `cancelled_at = NOW()`; state → `cancelled`; proration credit computed
- [ ] End-of-period cancel: `cancel_at_period_end = true`; subscription remains `active` until period end
- [ ] Cancellation reason (string) accepted and stored
- [ ] Customer notified via outbound webhook event `subscription.cancelled`

**Test Requirements:**
- [ ] Integration test: immediate cancel → state cancelled, credit computed; end-of-period → still active

**Estimated Time:** 1 hour

---

**EPIC:** Subscription Lifecycle
**ISSUE #RCV-036:** Plan change with proration trigger
**Branch:** `feat/RCV-036-plan-change`
**Labels:** `epic:subscriptions`, `type:feat`
**Blocked by:** #RCV-035, #RCV-031

**Description:**
Implement `POST /v1/subscriptions/:id/change-plan` that switches a subscription to a new plan mid-cycle. Calculates proration (upgrade or downgrade), generates a proration invoice, and updates the subscription. Uses the proration engine from Epic 9.

**Acceptance Criteria:**
- [ ] Request accepts `new_plan_id` and optional `immediate: boolean`
- [ ] Proration invoice generated with credit and debit line items
- [ ] Subscription `plan_id` and `current_period_*` updated atomically
- [ ] Cannot change to an archived plan → 422
- [ ] Change event written to `subscription_events`

**Test Requirements:**
- [ ] Integration test: upgrade mid-cycle → proration invoice with correct amounts

**Estimated Time:** 1 hour

---

## EPIC 9: PRORATION ENGINE

---

**EPIC:** Proration Engine
**ISSUE #RCV-037:** Proration calculation library
**Branch:** `feat/RCV-037-proration-lib`
**Labels:** `epic:proration`, `type:feat`
**Blocked by:** #RCV-030

**Description:**
Implement `src/lib/proration.ts` with pure functions for upgrade, downgrade, and cancellation proration. All calculations work in integer minor units (kobo/cents) using integer arithmetic to avoid floating-point errors. Functions are fully testable without DB access.

**Acceptance Criteria:**
- [ ] `calculateUpgradeProration(oldPlan, newPlan, daysRemaining, daysInPeriod, currency)` → credit + charge amounts
- [ ] `calculateDowngradeProration(...)` → credit amount (no immediate charge for downgrades)
- [ ] `calculateCancellationCredit(plan, daysRemaining, daysInPeriod, currency)` → credit amount
- [ ] All arithmetic uses integer division; no `Math.round` on money
- [ ] Edge case: daysRemaining = 0 → zero proration

**Test Requirements:**
- [ ] Unit tests: upgrade midpoint, upgrade last day, downgrade, cancellation, zero-day edge cases
- [ ] Property test: credit never exceeds full period amount

**Estimated Time:** 1.5 hours

---

**EPIC:** Proration Engine
**ISSUE #RCV-038:** Proration invoice line item generation
**Branch:** `feat/RCV-038-proration-line-items`
**Labels:** `epic:proration`, `type:feat`
**Blocked by:** #RCV-037

**Description:**
Implement `buildProrationLineItems(prorationResult, oldPlan, newPlan)` that converts proration calculation output into structured invoice line items. These are attached to a proration invoice (type `proration`) generated by the billing engine.

**Acceptance Criteria:**
- [ ] Line item types: `credit` (remaining time on old plan) and `charge` (remaining time on new plan)
- [ ] Descriptions human-readable: "Unused time on [PlanName] (N days)"
- [ ] Line items sum to net proration amount
- [ ] Currency consistent across all line items

**Test Requirements:**
- [ ] Unit tests: upgrade generates credit + charge; downgrade generates credit only

**Estimated Time:** 0.5 hours

---

**EPIC:** Proration Engine
**ISSUE #RCV-039:** Annual plan proration edge cases
**Branch:** `feat/RCV-039-annual-proration`
**Labels:** `epic:proration`, `type:feat`
**Blocked by:** #RCV-037

**Description:**
Extend the proration library to correctly handle annual billing interval plans, including leap-year day counts and mid-year upgrades. Annual plans have longer periods so proration credit amounts are significant — correctness is critical.

**Acceptance Criteria:**
- [ ] Annual period = exact calendar days between start and end (not 365 flat)
- [ ] Leap year periods (366 days) handled correctly
- [ ] Upgrade from monthly to annual mid-cycle: daily rate derived from monthly amount × 12 / annual days
- [ ] All existing proration tests still pass

**Test Requirements:**
- [ ] Unit tests: annual plan cancel on day 1, day 182, day 364; leap year period; monthly-to-annual upgrade

**Estimated Time:** 1 hour

---

## EPIC 10: BILLING ENGINE

---

**EPIC:** Billing Engine
**ISSUE #RCV-040:** Invoice DB schema and migration
**Branch:** `feat/RCV-040-invoice-schema`
**Labels:** `epic:billing`, `type:feat`
**Blocked by:** #RCV-030

**Description:**
Create the `invoices` and `invoice_line_items` migrations. Invoices are the financial record of every billing attempt. Line items detail the charges, credits, and discounts. Status tracks the full lifecycle from draft through paid or void.

**Acceptance Criteria:**
- [ ] `invoices` table: id, tenant_id, customer_id, subscription_id, type (`recurring|proration|metered`), status (`draft|open|paid|void|uncollectable`), currency, subtotal, discount_amount, tax_amount, total, period_start, period_end, paid_at, created_at
- [ ] `invoice_line_items` table: id, invoice_id, description, amount, quantity, unit_amount, type (`charge|credit|discount|tax`)
- [ ] Index on `(subscription_id, status)`

**Test Requirements:**
- [ ] Migration applies and rolls back cleanly

**Estimated Time:** 0.5 hours

---

**EPIC:** Billing Engine
**ISSUE #RCV-041:** Invoice generation service
**Branch:** `feat/RCV-041-invoice-generation`
**Labels:** `epic:billing`, `type:feat`
**Blocked by:** #RCV-040, #RCV-038, #RCV-020

**Description:**
Implement `generateInvoice(subscription, period)` that builds a complete invoice for a billing period: fetches plan pricing in the correct currency, applies metered usage totals, attaches coupon discounts, and persists the draft invoice. Separates generation from charge execution.

**Acceptance Criteria:**
- [ ] Fixed plan: single line item at plan's currency unit_amount
- [ ] Metered plan: line item with aggregated usage units × unit_amount
- [ ] Coupon applied if subscription has active coupon; coupon state updated
- [ ] Invoice created in `draft` status; moved to `open` when ready to charge
- [ ] Idempotent: same subscription + period → same invoice record (no duplicates)

**Test Requirements:**
- [ ] Unit tests: fixed plan, metered plan, coupon once, coupon repeating, coupon expired

**Estimated Time:** 2 hours

---

**EPIC:** Billing Engine
**ISSUE #RCV-042:** Multi-currency charge execution
**Branch:** `feat/RCV-042-charge-execution`
**Labels:** `epic:billing`, `type:feat`
**Blocked by:** #RCV-041, #RCV-028

**Description:**
Implement `executeInvoiceCharge(invoice, paymentMethod)` that calls the Nomba charge wrapper, updates invoice status to `paid` or triggers dunning on failure, and records the charge attempt. Currency on the invoice must match the card's currency capability.

**Acceptance Criteria:**
- [ ] Charge amount taken from `invoice.total`; currency from `invoice.currency`
- [ ] Success: invoice → `paid`; `paid_at` recorded; `charge_records` entry created
- [ ] Failure: invoice remains `open`; dunning engine notified via event
- [ ] Idempotency key = `invoice.id` to prevent double charges on retry
- [ ] Outbound webhook `invoice.paid` fired on success

**Test Requirements:**
- [ ] Integration test: charge success → invoice paid; charge failure → dunning triggered

**Estimated Time:** 1.5 hours

---

**EPIC:** Billing Engine
**ISSUE #RCV-043:** Daily billing scheduler with job locking
**Branch:** `feat/RCV-043-billing-scheduler`
**Labels:** `epic:billing`, `type:feat`
**Blocked by:** #RCV-042

**Description:**
Implement a cron-like scheduler (`src/jobs/billing-scheduler.ts`) that runs daily, queries for subscriptions whose `current_period_end <= NOW()`, generates and charges invoices for each. Uses PostgreSQL advisory locks to prevent concurrent runs across app instances.

**Acceptance Criteria:**
- [ ] Scheduler runs at configurable time (default 06:00 WAT)
- [ ] PostgreSQL advisory lock acquired before processing; released after
- [ ] Processes subscriptions in batches of 50; handles errors per-subscription without halting the run
- [ ] Each successful billing cycle updates `current_period_start/end` to next period
- [ ] `billing_runs` table logs start time, end time, count processed, count failed

**Test Requirements:**
- [ ] Integration test: two scheduler instances start simultaneously → only one acquires lock and processes

**Estimated Time:** 2 hours ⚠️ *estimate uncertain — advisory lock behaviour needs validation under load*

---

## EPIC 11: METERED USAGE ENGINE

---

**EPIC:** Metered Usage Engine
**ISSUE #RCV-044:** Usage record schema and ingestion endpoint
**Branch:** `feat/RCV-044-usage-ingestion`
**Labels:** `epic:metered`, `type:feat`
**Blocked by:** #RCV-030

**Description:**
Create the `usage_records` table and implement `POST /v1/subscriptions/:id/usage` for tenants to report usage events. Accepts quantity, timestamp, and an idempotency key. Only valid for subscriptions on metered plans.

**Acceptance Criteria:**
- [ ] `usage_records` table: id, subscription_id, tenant_id, quantity (numeric), timestamp, idempotency_key, billing_period_start, created_at
- [ ] Unique index on `(subscription_id, idempotency_key)`
- [ ] Posting to a non-metered subscription → 422
- [ ] Duplicate idempotency key → 200 with existing record (no duplicate insert)
- [ ] Usage timestamped with event time (not server receive time)

**Test Requirements:**
- [ ] Integration test: ingest usage; duplicate idempotency key idempotent; non-metered plan → 422

**Estimated Time:** 1 hour

---

**EPIC:** Metered Usage Engine
**ISSUE #RCV-045:** Usage aggregation at billing cutoff
**Branch:** `feat/RCV-045-usage-aggregation`
**Labels:** `epic:metered`, `type:feat`
**Blocked by:** #RCV-044

**Description:**
Implement `aggregateUsage(subscriptionId, periodStart, periodEnd)` that queries `usage_records` within the billing period and applies the plan's aggregate function (`sum`, `max`, or `last`). Result is the billable quantity used by invoice generation.

**Acceptance Criteria:**
- [ ] `sum`: total of all quantities in period
- [ ] `max`: highest single quantity record in period
- [ ] `last`: quantity from the most recent record in period
- [ ] Zero records in period → 0 quantity (no error)
- [ ] Late usage (timestamp before period but inserted after) excluded based on timestamp, not `created_at`

**Test Requirements:**
- [ ] Unit tests for sum, max, last; zero records; late usage exclusion

**Estimated Time:** 1 hour

---

**EPIC:** Metered Usage Engine
**ISSUE #RCV-046:** Usage reporting endpoint
**Branch:** `feat/RCV-046-usage-reporting`
**Labels:** `epic:metered`, `type:feat`
**Blocked by:** #RCV-045

**Description:**
Implement `GET /v1/subscriptions/:id/usage` that returns aggregated usage for the current and previous billing periods, plus a list of individual usage records. Allows tenants to display usage dashboards to their own customers.

**Acceptance Criteria:**
- [ ] Returns: `{ currentPeriod: { start, end, quantity }, previousPeriod: { ... }, records: [...] }`
- [ ] Records paginated; default 50 per page
- [ ] Only accessible by subscription's owning tenant
- [ ] Graceful response when no usage records exist

**Test Requirements:**
- [ ] Integration test: records inserted across two periods; verify correct period aggregation

**Estimated Time:** 0.5 hours

---

## EPIC 12: DUNNING ENGINE

---

**EPIC:** Dunning Engine
**ISSUE #RCV-047:** Dunning policy schema and defaults
**Branch:** `feat/RCV-047-dunning-schema`
**Labels:** `epic:dunning`, `type:feat`
**Blocked by:** #RCV-030

**Description:**
Create the `dunning_policies` and `dunning_attempts` migrations. `dunning_policies` holds per-tenant configuration: retry schedule (days array), max attempts, final action. A default policy is seeded for new tenants respecting Nigerian salary cycle timing.

**Acceptance Criteria:**
- [ ] `dunning_policies` table: id, tenant_id (FK, unique), retry_days (integer[]), max_attempts, final_action (`cancel|suspend`), use_backup_on_first_failure (bool), created_at, updated_at
- [ ] Default policy seeded: retry_days `[1, 3, 7, 14]` (salary-cycle-aware), max_attempts 4, use_backup_on_first_failure true
- [ ] `dunning_attempts` table: id, subscription_id, invoice_id, attempt_number, scheduled_at, attempted_at, result, payment_method_id, created_at

**Test Requirements:**
- [ ] Migration applies; default policy inserted for new tenant

**Estimated Time:** 0.5 hours

---

**EPIC:** Dunning Engine
**ISSUE #RCV-048:** Nigerian salary-cycle-aware retry scheduler
**Branch:** `feat/RCV-048-dunning-scheduler`
**Labels:** `epic:dunning`, `type:feat`
**Blocked by:** #RCV-047

**Description:**
Implement `scheduleDunningAttempts(subscription, invoice, policy)` that generates retry `scheduled_at` timestamps based on the policy's `retry_days` offsets, but adjusts dates that fall between the 24th–27th of the month (Nigerian salary period) to retry on the 28th instead, maximising recovery probability.

**Acceptance Criteria:**
- [ ] Base retry times computed from charge failure time + `retry_days[n]` days
- [ ] Any `scheduled_at` between 24th–27th (inclusive) of any month bumped to 28th at 09:00 WAT
- [ ] If 28th already passed, bumped to next occurrence of 28th
- [ ] Generated attempts persisted in `dunning_attempts` with status `scheduled`
- [ ] Function returns array of scheduled attempt records

**Test Requirements:**
- [ ] Unit tests: failure on 20th → retry on 21st, 23rd, 27th→28th, 3rd of next month; failure on 25th → first retry on 28th

**Estimated Time:** 1.5 hours

---

**EPIC:** Dunning Engine
**ISSUE #RCV-049:** Backup card fallback on first failure
**Branch:** `feat/RCV-049-backup-card-fallback`
**Labels:** `epic:dunning`, `type:feat`
**Blocked by:** #RCV-048, #RCV-024

**Description:**
When `use_backup_on_first_failure = true` and the first charge attempt fails, the dunning engine should immediately attempt the backup card (if one exists) before scheduling the standard retry sequence. A successful backup charge resolves the invoice and cancels the dunning schedule.

**Acceptance Criteria:**
- [ ] On first charge failure: query backup card for customer
- [ ] If backup exists: attempt charge immediately; success → invoice paid, dunning cancelled
- [ ] If backup charge fails: schedule standard retry sequence as normal
- [ ] If no backup card: proceed directly to scheduled retries
- [ ] Backup attempt recorded in `dunning_attempts` with `payment_method_id` of backup card

**Test Requirements:**
- [ ] Integration test: primary fails → backup attempted; backup success → invoice paid; backup fail → retries scheduled

**Estimated Time:** 1.5 hours

---

**EPIC:** Dunning Engine
**ISSUE #RCV-050:** Dunning retry executor
**Branch:** `feat/RCV-050-dunning-executor`
**Labels:** `epic:dunning`, `type:feat`
**Blocked by:** #RCV-049, #RCV-042

**Description:**
Implement the dunning job worker that runs every hour, queries `dunning_attempts` where `scheduled_at <= NOW() AND status = 'scheduled'`, executes each charge, and updates attempt status. On max attempts exhausted, triggers the final action (cancel or suspend) per policy.

**Acceptance Criteria:**
- [ ] Worker queries and processes due attempts in batches
- [ ] Successful attempt: invoice paid, subscription → `active`, remaining attempts cancelled
- [ ] Failed attempt: attempt status → `failed`; if max attempts reached → `finalAction` applied
- [ ] `finalAction = cancel`: subscription → `cancelled` with reason `dunning_exhausted`
- [ ] `finalAction = suspend`: subscription → `past_due`
- [ ] Outbound webhook `subscription.dunning_failed` fired at exhaustion

**Test Requirements:**
- [ ] Integration test: 4 failed attempts → subscription cancelled; 3rd attempt succeeds → subscription active

**Estimated Time:** 2 hours

---

**EPIC:** Dunning Engine
**ISSUE #RCV-051:** Self-cure detection on card update
**Branch:** `feat/RCV-051-self-cure`
**Labels:** `epic:dunning`, `type:feat`
**Blocked by:** #RCV-050, #RCV-024

**Description:**
When a customer in `past_due` status updates their payment method (adds a new card or updates existing), trigger an immediate retry of the outstanding invoice. This "self-cure" flow recovers subscribers without waiting for the next scheduled dunning attempt.

**Acceptance Criteria:**
- [ ] Hook fires when a `payment_method` record is created or updated for a customer with `past_due` subscription
- [ ] Outstanding invoice charge attempted with the new/updated card immediately
- [ ] On success: subscription → `active`; dunning schedule cancelled
- [ ] On failure: dunning schedule continues from current position
- [ ] Self-cure event logged in `dunning_attempts` with type `self_cure`

**Test Requirements:**
- [ ] Integration test: customer past_due → adds card → charge attempted immediately

**Estimated Time:** 1 hour

---

**EPIC:** Dunning Engine
**ISSUE #RCV-052:** Dunning configuration endpoint
**Branch:** `feat/RCV-052-dunning-config`
**Labels:** `epic:dunning`, `type:feat`
**Blocked by:** #RCV-047

**Description:**
Implement `GET` and `PATCH /v1/dunning/policy` allowing tenants to customise their dunning policy. Validates that `retry_days` is a sorted array of 1–30 integers with no duplicates, and max_attempts matches the length of retry_days.

**Acceptance Criteria:**
- [ ] `GET /v1/dunning/policy` returns current policy (creates default if none exists)
- [ ] `PATCH /v1/dunning/policy` validates and updates retry_days, max_attempts, final_action, use_backup_on_first_failure
- [ ] `retry_days` must be sorted, unique, integers 1–30, max 6 elements
- [ ] Changes apply to new dunning schedules only; in-flight schedules unaffected

**Test Requirements:**
- [ ] Unit test: unsorted retry_days → 422; duplicate days → 422; valid payload → persisted

**Estimated Time:** 0.5 hours

---

## EPIC 13: INBOUND WEBHOOK HANDLER

---

**EPIC:** Inbound Webhook Handler
**ISSUE #RCV-053:** Nomba webhook receiver and signature verification
**Branch:** `feat/RCV-053-inbound-webhook-receiver`
**Labels:** `epic:inbound-webhooks`, `type:feat`
**Blocked by:** #RCV-025

**Description:**
Implement `POST /v1/webhooks/nomba` as the inbound webhook receiver. Verifies the HMAC-SHA256 signature from Nomba using the raw request body before any parsing. Rejects unsigned or tampered payloads with 401. This is the security perimeter for all Nomba events.

**Acceptance Criteria:**
- [ ] Raw body preserved for signature computation (no pre-parsing)
- [ ] `X-Nomba-Signature` header extracted and verified via `crypto.timingSafeEqual`
- [ ] Invalid signature → 401 logged with raw payload hash for debugging
- [ ] Valid signature → 200 acknowledged immediately; processing happens async
- [ ] Webhook secret configurable per tenant via `tenants.nomba_webhook_secret`

**Test Requirements:**
- [ ] Unit test: valid HMAC → passes; tampered body → 401; missing header → 401

**Estimated Time:** 1 hour

---

**EPIC:** Inbound Webhook Handler
**ISSUE #RCV-054:** Webhook event idempotency and routing
**Branch:** `feat/RCV-054-webhook-routing`
**Labels:** `epic:inbound-webhooks`, `type:feat`
**Blocked by:** #RCV-053

**Description:**
After signature verification, check if the Nomba event ID has already been processed (idempotency table). Route new events to the correct domain handler based on event type. Log unrecognised event types to a dead-letter table for inspection without crashing.

**Acceptance Criteria:**
- [ ] `webhook_events` table: id, nomba_event_id (unique), event_type, payload (JSONB), processed_at, tenant_id
- [ ] Duplicate `nomba_event_id` → 200 (already processed, no reprocessing)
- [ ] Routing map: `charge.success` → charge success handler, `charge.failure` → charge failure handler, `refund.completed` → refund handler
- [ ] Unknown event type → logged to `dead_letter_webhooks`; returns 200

**Test Requirements:**
- [ ] Unit test: duplicate event ID → no reprocessing; unknown type → dead letter

**Estimated Time:** 1 hour

---

**EPIC:** Inbound Webhook Handler
**ISSUE #RCV-055:** Charge success and failure domain handlers
**Branch:** `feat/RCV-055-charge-event-handlers`
**Labels:** `epic:inbound-webhooks`, `type:feat`
**Blocked by:** #RCV-054, #RCV-042, #RCV-048

**Description:**
Implement the domain handlers for `charge.success` and `charge.failure` Nomba events. Success finalises the invoice and activates/reactivates the subscription. Failure triggers dunning scheduling. Both handlers are idempotent by checking current invoice and subscription state before acting.

**Acceptance Criteria:**
- [ ] `charge.success`: invoice → `paid`; subscription → `active` if was `past_due`/`incomplete`
- [ ] `charge.failure`: invoice remains `open`; dunning scheduling triggered for subscription
- [ ] Both handlers: no-op if invoice already in terminal state (`paid`/`void`)
- [ ] `charge_records` table updated with Nomba charge ID on success

**Test Requirements:**
- [ ] Integration test: success handler idempotent; failure handler triggers dunning once

**Estimated Time:** 1.5 hours

---

## EPIC 14: OUTBOUND WEBHOOK SYSTEM

---

**EPIC:** Outbound Webhook System
**ISSUE #RCV-056:** Webhook endpoint registration CRUD
**Branch:** `feat/RCV-056-webhook-registration`
**Labels:** `epic:outbound-webhooks`, `type:feat`
**Blocked by:** #RCV-012

**Description:**
Implement CRUD for tenants to register URLs to receive outbound webhook events. Each endpoint specifies which event types to subscribe to and stores a signing secret. Supports multiple endpoints per tenant (e.g. staging and production).

**Acceptance Criteria:**
- [ ] `webhook_endpoints` table: id, tenant_id, url, event_types (text[]), signing_secret, enabled, created_at
- [ ] `POST /v1/webhooks/endpoints` creates endpoint; auto-generates signing secret if not provided
- [ ] `GET /v1/webhooks/endpoints` lists all endpoints for tenant
- [ ] `PATCH /v1/webhooks/endpoints/:id` updates url, event_types, enabled
- [ ] `DELETE /v1/webhooks/endpoints/:id` removes endpoint

**Test Requirements:**
- [ ] Integration test: register endpoint; update event types; verify signing secret returned only at creation

**Estimated Time:** 1 hour

---

**EPIC:** Outbound Webhook System
**ISSUE #RCV-057:** Outbound delivery worker with retry and audit log
**Branch:** `feat/RCV-057-outbound-delivery`
**Labels:** `epic:outbound-webhooks`, `type:feat`
**Blocked by:** #RCV-056

**Description:**
Implement the outbound webhook delivery worker. For each event, fan out to all matching tenant endpoints, sign the payload with HMAC-SHA256, POST to the URL, and record the result in a `webhook_deliveries` audit log. Failed deliveries retry with exponential backoff: 1min, 5min, 30min, 2hr, 8hr.

**Acceptance Criteria:**
- [ ] Payload signed: `X-Recurva-Signature: sha256=<hmac>` header on every delivery
- [ ] Delivery attempt logged: endpoint_id, event_type, payload, response_status, response_body (truncated to 1KB), duration_ms, attempt_number
- [ ] Non-2xx response → scheduled retry using backoff schedule
- [ ] After 5 failed attempts → delivery marked `failed`; no further retries
- [ ] `manual_retry` resets attempt count to 0 for a specific delivery

**Test Requirements:**
- [ ] Integration test: HTTP 500 response → 5 retries scheduled; 200 → no retry; signature verifiable

**Estimated Time:** 2 hours

---

**EPIC:** Outbound Webhook System
**ISSUE #RCV-058:** Manual retry endpoint for failed deliveries
**Branch:** `feat/RCV-058-manual-retry`
**Labels:** `epic:outbound-webhooks`, `type:feat`
**Blocked by:** #RCV-057

**Description:**
Implement `POST /v1/webhooks/deliveries/:id/retry` that re-queues a failed delivery for immediate re-attempt. Also implement `GET /v1/webhooks/deliveries` for tenants to inspect delivery history with filtering by endpoint, event type, and status.

**Acceptance Criteria:**
- [ ] Retry endpoint: delivery must be in `failed` status; re-queues with attempt_number reset
- [ ] `GET /v1/webhooks/deliveries` supports `?endpoint_id=&event_type=&status=`
- [ ] Delivery list paginated; shows latest attempt details
- [ ] 404 if delivery belongs to different tenant

**Test Requirements:**
- [ ] Integration test: retry failed delivery → re-attempts; 404 for cross-tenant access

**Estimated Time:** 0.5 hours

---

## EPIC 15: CUSTOMER SELF-SERVE PORTAL

---

**EPIC:** Customer Self-Serve Portal
**ISSUE #RCV-059:** Portal JWT authentication (magic link)
**Branch:** `feat/RCV-059-portal-auth`
**Labels:** `epic:portal`, `type:feat`
**Blocked by:** #RCV-022

**Description:**
Implement magic-link email authentication for the customer self-serve portal. `POST /v1/portal/auth/request` sends a time-limited JWT link to the customer's email. `GET /v1/portal/auth/verify?token=...` validates the token and returns a session JWT scoped to that customer and tenant.

**Acceptance Criteria:**
- [ ] Magic link token: JWT, 15-minute expiry, signed with `JWT_SECRET`, payload includes `customerId` and `tenantId`
- [ ] Session JWT: 24-hour expiry; different claims from magic link token
- [ ] Email dispatch via configurable SMTP (`SMTP_*` env vars)
- [ ] Rate limit: 3 magic link requests per customer per 10 minutes
- [ ] Invalid/expired token → 401

**Test Requirements:**
- [ ] Unit test: expired token → 401; valid token → session JWT; rate limit enforced

**Estimated Time:** 1.5 hours

---

**EPIC:** Customer Self-Serve Portal
**ISSUE #RCV-060:** Portal subscription and invoice views
**Branch:** `feat/RCV-060-portal-views`
**Labels:** `epic:portal`, `type:feat`
**Blocked by:** #RCV-059, #RCV-041

**Description:**
Implement portal read endpoints: `GET /v1/portal/subscriptions` (customer's subscriptions), `GET /v1/portal/invoices` (invoice history), and `GET /v1/portal/invoices/:id/download` (PDF or JSON invoice). All scoped to the authenticated customer's `customerId`.

**Acceptance Criteria:**
- [ ] `GET /v1/portal/subscriptions` returns all subscriptions with plan name, status, next billing date
- [ ] `GET /v1/portal/invoices` returns paginated invoice history with status and total
- [ ] `GET /v1/portal/invoices/:id/download` returns invoice as JSON (PDF out of scope for MVP)
- [ ] All endpoints reject tokens from other customers

**Test Requirements:**
- [ ] Integration test: customer A cannot access customer B's invoices

**Estimated Time:** 1 hour

---

**EPIC:** Customer Self-Serve Portal
**ISSUE #RCV-061:** Portal subscription management actions
**Branch:** `feat/RCV-061-portal-actions`
**Labels:** `epic:portal`, `type:feat`
**Blocked by:** #RCV-060, #RCV-034, #RCV-035, #RCV-036

**Description:**
Expose subscription management actions in the portal: plan upgrade/downgrade, pause, resume, and cancel. These call the same service layer as the tenant API, but are scoped to the authenticated customer and limited to their own subscriptions.

**Acceptance Criteria:**
- [ ] `POST /v1/portal/subscriptions/:id/cancel` (end-of-period only from portal)
- [ ] `POST /v1/portal/subscriptions/:id/pause` and `/resume`
- [ ] `POST /v1/portal/subscriptions/:id/change-plan` (upgrade/downgrade)
- [ ] Customer cannot cancel another customer's subscription → 404
- [ ] Immediate cancellation disabled from portal (tenants must do this via API)

**Test Requirements:**
- [ ] Integration test: portal customer cancels own subscription end-of-period; cannot cancel others'

**Estimated Time:** 1 hour

---

## EPIC 16: TENANT DASHBOARD

---

**EPIC:** Tenant Dashboard
**ISSUE #RCV-062:** Dashboard JWT authentication
**Branch:** `feat/RCV-062-dashboard-auth`
**Labels:** `epic:dashboard`, `type:feat`
**Blocked by:** #RCV-012

**Description:**
Implement `POST /v1/dashboard/auth` that accepts an email + password for the tenant admin user (credentials stored during tenant registration), validates them, and returns a dashboard-scoped JWT. Different from API key auth — this is for human operators, not machine integrations.

**Acceptance Criteria:**
- [ ] `tenant_admin_credentials` table: tenant_id, email, password_hash (bcrypt)
- [ ] `POST /v1/dashboard/auth` returns 24-hour JWT with `tenantId` and `role: admin` claims
- [ ] Invalid credentials → 401 with no enumeration hint
- [ ] Dashboard JWT middleware validates token and injects `c.var.tenant` same as API key middleware

**Test Requirements:**
- [ ] Unit test: valid creds → JWT; invalid → 401; JWT accepted by dashboard middleware

**Estimated Time:** 1 hour

---

**EPIC:** Tenant Dashboard
**ISSUE #RCV-063:** MRR, churn, and subscriber count metrics
**Branch:** `feat/RCV-063-dashboard-metrics`
**Labels:** `epic:dashboard`, `type:feat`
**Blocked by:** #RCV-062, #RCV-041

**Description:**
Implement `GET /v1/dashboard/metrics` returning the core SaaS health metrics: active subscriber count, MRR (sum of active subscription monthly-normalised amounts), and monthly churn rate. All computed from live data, cached for 5 minutes via in-memory cache.

**Acceptance Criteria:**
- [ ] `activeSubscribers`: count of subscriptions with status `active`
- [ ] `mrr`: sum of active subscriptions' monthly-equivalent amounts in NGN (annual plans divided by 12); multi-currency reported as-is per currency
- [ ] `churnRate`: (subscriptions cancelled this month / subscriptions active at month start) × 100
- [ ] Response cached for 5 minutes to avoid expensive queries on every render
- [ ] Metrics broken down by currency when multi-currency present

**Test Requirements:**
- [ ] Unit test: MRR calculation with annual and monthly plans; churn rate formula

**Estimated Time:** 1.5 hours

---

**EPIC:** Tenant Dashboard
**ISSUE #RCV-064:** Dashboard recent failures and dunning recovery rate
**Branch:** `feat/RCV-064-dashboard-dunning-metrics`
**Labels:** `epic:dashboard`, `type:feat`
**Blocked by:** #RCV-063, #RCV-050

**Description:**
Implement `GET /v1/dashboard/failed-payments` (recent failed charges list) and add `dunningRecoveryRate` to the metrics endpoint. Recovery rate = (subscriptions recovered from `past_due` to `active` this month) / (subscriptions that entered `past_due` this month).

**Acceptance Criteria:**
- [ ] Failed payments list: customer name, amount, currency, plan, failed_at, attempt_count; paginated, last 30 days
- [ ] `dunningRecoveryRate` returned as percentage (0–100)
- [ ] `GET /v1/dashboard/metrics/growth` returns new subscriber counts grouped by day for last 30 days

**Test Requirements:**
- [ ] Unit test: recovery rate formula; 0 past_due entries → 0% (not division-by-zero)

**Estimated Time:** 1 hour

---

## EPIC 17: REPORTING AND ANALYTICS

---

**EPIC:** Reporting and Analytics
**ISSUE #RCV-065:** Revenue report endpoint
**Branch:** `feat/RCV-065-revenue-report`
**Labels:** `epic:reporting`, `type:feat`
**Blocked by:** #RCV-041

**Description:**
Implement `GET /v1/reports/revenue` returning total revenue by period (monthly/daily), broken down by plan and currency. Accepts `from`, `to`, and `interval` query params. Based on `paid` invoices only.

**Acceptance Criteria:**
- [ ] Filters: `from` (ISO date), `to` (ISO date), `interval=monthly|daily`, `currency`
- [ ] Response: array of `{ period, currency, plan_id, plan_name, amount, invoice_count }`
- [ ] Only `paid` invoices included; `void` excluded
- [ ] Results sorted by period ascending

**Test Requirements:**
- [ ] Integration test: 3 months of paid invoices → correct monthly totals per plan

**Estimated Time:** 1 hour

---

**EPIC:** Reporting and Analytics
**ISSUE #RCV-066:** Subscriber cohort and CLV report
**Branch:** `feat/RCV-066-cohort-report`
**Labels:** `epic:reporting`, `type:feat`
**Blocked by:** #RCV-065

**Description:**
Implement `GET /v1/reports/cohorts` returning subscriber retention by monthly cohort (customers grouped by their first subscription month, tracked across subsequent months). Also implement `GET /v1/reports/clv` returning average customer lifetime value by plan.

**Acceptance Criteria:**
- [ ] Cohort report: `{ cohort: "2025-01", months: [100, 82, 74, ...] }` (count retained per month)
- [ ] CLV report: average total paid per customer, grouped by plan, for customers with cancelled subscriptions
- [ ] Both reports support `from`/`to` date filters
- [ ] Reports execute in under 2 seconds for 12 months of data (add indexes if needed)

**Test Requirements:**
- [ ] Unit test: CLV formula; cohort retention counting logic

**Estimated Time:** 1.5 hours ⚠️ *estimate uncertain — query performance on large datasets may require optimisation*

---

**EPIC:** Reporting and Analytics
**ISSUE #RCV-067:** Dunning recovery and invoice reconciliation reports
**Branch:** `feat/RCV-067-dunning-report`
**Labels:** `epic:reporting`, `type:feat`
**Blocked by:** #RCV-050

**Description:**
Implement `GET /v1/reports/dunning` returning dunning attempt outcomes by month (success, failure, exhausted counts) and recovery amounts. Also implement `GET /v1/reports/reconciliation` matching invoices to charge records and flagging discrepancies.

**Acceptance Criteria:**
- [ ] Dunning report: `{ month, attempts, recovered, failed, exhausted, recoveredAmount }`
- [ ] Reconciliation report: flags invoices with status `paid` but no matching `charge_records` entry
- [ ] Reconciliation flags invoices with `charge_records` entries but still `open` status
- [ ] Both reports accept `from`/`to` date range

**Test Requirements:**
- [ ] Unit test: reconciliation correctly identifies mismatches in test data

**Estimated Time:** 1 hour

---

## EPIC 18: DEVELOPER EXPERIENCE

---

**EPIC:** Developer Experience
**ISSUE #RCV-068:** API reference documentation
**Branch:** `feat/RCV-068-api-docs`
**Labels:** `epic:devex`, `type:docs`
**Blocked by:** #RCV-067

**Description:**
Write comprehensive API reference documentation in markdown covering all endpoints: authentication, request/response schemas, error codes, and example cURL calls. Organised by resource (tenants, plans, subscriptions, etc.). This is the primary external-facing document for API consumers.

**Acceptance Criteria:**
- [ ] Every endpoint documented: method, path, auth requirement, request body, response body, error codes
- [ ] Example cURL request and response for every endpoint
- [ ] Error code table with code, HTTP status, and plain-English description
- [ ] Hosted at `/docs/api-reference.md` in repository

**Estimated Time:** 2 hours

---

**EPIC:** Developer Experience
**ISSUE #RCV-069:** Postman collection
**Branch:** `feat/RCV-069-postman-collection`
**Labels:** `epic:devex`, `type:docs`
**Blocked by:** #RCV-068

**Description:**
Create a complete Postman collection covering all API endpoints, with environment variables for `BASE_URL` and `API_KEY`, pre-request scripts for auth, and test scripts that assert status codes. Exportable as JSON for easy import.

**Acceptance Criteria:**
- [ ] All endpoints present with example request bodies
- [ ] Environment template with `base_url`, `api_key`, `customer_id` variables
- [ ] Collection-level pre-request script sets `Authorization` header from `api_key` variable
- [ ] At least one test script per request asserting correct status code
- [ ] Exported and committed as `docs/recurva.postman_collection.json`

**Estimated Time:** 1.5 hours

---

**EPIC:** Developer Experience
**ISSUE #RCV-070:** Integration quickstart, webhook catalog, and README
**Branch:** `feat/RCV-070-docs`
**Labels:** `epic:devex`, `type:docs`
**Blocked by:** #RCV-068

**Description:**
Write three documents: (1) integration quickstart guide showing how to go from API key to first subscription charge in 10 minutes, (2) webhook event catalog listing all outbound events with payload schemas, (3) README with architecture overview, local dev setup, and deployment guide.

**Acceptance Criteria:**
- [ ] Quickstart: register tenant → create plan → create customer → create subscription (end-to-end code examples in JavaScript)
- [ ] Webhook catalog: event name, trigger, full payload JSON example for every event
- [ ] README: architecture diagram description, `docker compose up` to running, env var table, CI/CD pipeline description
- [ ] All docs lint with no broken internal links

**Estimated Time:** 1.5 hours

---

## EPIC 19: PRODUCTION READINESS

---

**EPIC:** Production Readiness
**ISSUE #RCV-071:** Production Dockerfile and docker-compose
**Branch:** `feat/RCV-071-dockerfile`
**Labels:** `epic:production`, `type:chore`
**Blocked by:** #RCV-009

**Description:**
Create the production-optimised multi-stage Dockerfile and `docker-compose.yml` for app + PostgreSQL + Nginx. The Dockerfile minimises image size using Bun's `--compile` flag where applicable. Compose file should be production-safe (no dev dependencies, restart policies, resource limits).

**Acceptance Criteria:**
- [ ] Multi-stage Dockerfile: builder stage installs deps; runner stage copies only production output
- [ ] Final image under 200MB
- [ ] `docker-compose.yml` includes `restart: unless-stopped` on all services
- [ ] PostgreSQL data volume named and persistent across container restarts
- [ ] Environment variables injected via `.env` file (not baked into image)

**Test Requirements:**
- [ ] Build succeeds from clean checkout; `docker compose up` reaches healthy state

**Estimated Time:** 1 hour

---

**EPIC:** Production Readiness
**ISSUE #RCV-072:** Nginx reverse proxy with security headers and SSL
**Branch:** `feat/RCV-072-nginx-ssl`
**Labels:** `epic:production`, `type:chore`
**Blocked by:** #RCV-071

**Description:**
Write the Nginx configuration for reverse proxying to the Bun app with security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options) and Certbot SSL certificate setup. Include a cron renewal config. Document the Cloudflare DNS configuration steps.

**Acceptance Criteria:**
- [ ] `nginx.conf` proxies `api.recurva.yourdomain.com` to app on port 3000
- [ ] Security headers: HSTS (1 year), X-Frame-Options DENY, X-Content-Type-Options nosniff, CSP restrictive policy
- [ ] Certbot `--webroot` challenge configured; `certbot renew` tested in dry-run
- [ ] Nginx rate limiting: 100 req/min per IP on `/v1/webhooks/nomba`
- [ ] `docs/cloudflare-dns.md` documents required DNS records

**Test Requirements:**
- [ ] `curl -I https://api.recurva.yourdomain.com/health` returns 200 with all security headers

**Estimated Time:** 1 hour

---

**EPIC:** Production Readiness
**ISSUE #RCV-073:** Production environment checklist and DB backup strategy
**Branch:** `feat/RCV-073-prod-ops`
**Labels:** `epic:production`, `type:chore`
**Blocked by:** #RCV-072

**Description:**
Create `docs/production-checklist.md` enumerating every environment variable with allowed values and security notes. Write a `scripts/backup.sh` that pg_dumps the database and uploads to an S3-compatible bucket (OCI Object Storage), with a cron entry for daily runs and 30-day retention.

**Acceptance Criteria:**
- [ ] Checklist covers all env vars; marks which are secrets (never log)
- [ ] `scripts/backup.sh` performs pg_dump, gzip-compresses, uploads to OCI Object Storage
- [ ] Backup script tests restore by downloading latest backup and running `pg_restore --schema-only`
- [ ] Cron entry documented: `0 2 * * * /opt/recurva/scripts/backup.sh` (2am WAT daily)
- [ ] 30-day retention: backup script deletes objects older than 30 days

**Test Requirements:**
- [ ] Dry-run backup script in CI against test DB; verify object created

**Estimated Time:** 1 hour

---

**EPIC:** Production Readiness
**ISSUE #RCV-074:** GitHub Actions full deploy pipeline to Oracle VPS
**Branch:** `feat/RCV-074-deploy-pipeline`
**Labels:** `epic:production`, `type:chore`
**Blocked by:** #RCV-073, #RCV-009

**Description:**
Extend `.github/workflows/` with a `deploy.yml` that triggers on push to `main` after CI passes, SSHs into the Oracle VPS, pulls the latest image, runs migrations, and performs a zero-downtime rolling restart via `docker compose up --no-deps --build app`.

**Acceptance Criteria:**
- [ ] Deploy workflow triggers only after `ci.yml` succeeds
- [ ] SSH key stored in GitHub Actions secret; host key pinned to prevent MITM
- [ ] Deployment order: pull → migrate → `docker compose up --no-deps --build app`
- [ ] Rollback step: if health check fails after deploy, previous container restarted
- [ ] Slack or email notification on deploy success or failure (via webhook)

**Test Requirements:**
- [ ] Deploy workflow succeeds end-to-end in staging VPS before first production use

**Estimated Time:** 1.5 hours

---

**EPIC:** Production Readiness
**ISSUE #RCV-075:** Production smoke test suite and load test
**Branch:** `feat/RCV-075-smoke-load-tests`
**Labels:** `epic:production`, `type:test`
**Blocked by:** #RCV-074

**Description:**
Write a smoke test script (`scripts/smoke-test.sh`) that hits every critical endpoint post-deploy and asserts 200s. Write a basic load test using `k6` targeting the billing scheduler endpoint to validate it handles 500 concurrent subscriptions in a single run without lock contention or timeouts.

**Acceptance Criteria:**
- [ ] Smoke test covers: health, tenant register, plan create, customer create, subscription create
- [ ] Smoke test runs in under 60 seconds; exits non-zero on any failure
- [ ] k6 load test: 500 virtual subscriptions processed in billing run; p99 < 5s per subscription
- [ ] Load test results summary committed to `docs/load-test-results.md`
- [ ] Smoke test integrated as final step in deploy pipeline

**Test Requirements:**
- [ ] Smoke test passes against staging before production deploy

**Estimated Time:** 1.5 hours ⚠️ *estimate uncertain — load test results may surface performance issues requiring additional work*

---

## Summary

| Epic | Issues | Estimated Hours |
|------|--------|-----------------|
| 1 – Project Foundation | RCV-001 to RCV-009 | 5.0h |
| 2 – Tenant Management | RCV-010 to RCV-013 | 3.0h |
| 3 – Plan Management | RCV-014 to RCV-016 | 2.5h |
| 4 – Coupon Engine | RCV-017 to RCV-020 | 3.5h |
| 5 – Customer Management | RCV-021 to RCV-022 | 1.5h |
| 6 – Payment Method Management | RCV-023 to RCV-024 | 1.5h |
| 7 – Nomba Integration Layer | RCV-025 to RCV-029 | 5.5h |
| 8 – Subscription Lifecycle | RCV-030 to RCV-036 | 7.5h |
| 9 – Proration Engine | RCV-037 to RCV-039 | 3.0h |
| 10 – Billing Engine | RCV-040 to RCV-043 | 6.0h |
| 11 – Metered Usage Engine | RCV-044 to RCV-046 | 2.5h |
| 12 – Dunning Engine | RCV-047 to RCV-052 | 7.0h |
| 13 – Inbound Webhook Handler | RCV-053 to RCV-055 | 3.5h |
| 14 – Outbound Webhook System | RCV-056 to RCV-058 | 3.5h |
| 15 – Customer Self-Serve Portal | RCV-059 to RCV-061 | 3.5h |
| 16 – Tenant Dashboard | RCV-062 to RCV-064 | 3.5h |
| 17 – Reporting and Analytics | RCV-065 to RCV-067 | 3.5h |
| 18 – Developer Experience | RCV-068 to RCV-070 | 5.0h |
| 19 – Production Readiness | RCV-071 to RCV-075 | 6.0h |
| **Total** | **75 issues** | **~76.5h** |

> ⚠️ **Note:** Total exceeds the 60h target. Recommended cuts to reach ~60h: defer Epic 17 (Reporting) after hackathon (-3.5h), trim Epic 18 to README + Postman only (-1.5h), and defer the k6 load test in RCV-075 (-0.5h). This brings working estimate to **~71h** — still above 60h, so additionally consider deferring the Customer Self-Serve Portal (Epic 15, -3.5h) and implementing the dashboard as static queries only (drop RCV-064, -1h), reaching **~66h**. With a senior developer's rhythm and no major blockers, 66h across 7×9h days is achievable.
>
> ⚠️ **Uncertain estimates flagged:** RCV-043 (billing scheduler lock contention), RCV-066 (cohort query performance), RCV-075 (load test may surface perf issues).
