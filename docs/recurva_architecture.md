# Recurva — Architecture Document
> **Version:** 1.0.0 | **Status:** Living Document | **Audience:** Senior Engineers

This document is the single source of truth for every architectural decision in the Recurva codebase. A senior fintech engineer should be able to read this document and understand the entire system without asking anyone any questions.

---

## Table of Contents

1. [Architectural Overview](#1-architectural-overview)
2. [Project Structure](#2-project-structure)
3. [Domain Module Design](#3-domain-module-design)
4. [Subscription State Machine](#4-subscription-state-machine-implementation)
5. [Data Layer Design](#5-data-layer-design)
6. [Nomba Client Design](#6-nomba-client-design)
7. [Billing Scheduler Design](#7-billing-scheduler-design)
8. [Dunning Engine Design](#8-dunning-engine-design)
9. [Coupon Engine Design](#9-coupon-engine-design)
10. [Metered Billing Design](#10-metered-billing-design)
11. [Webhook System Design](#11-webhook-system-design)
12. [API Layer Design](#12-api-layer-design)
13. [Security Implementation](#13-security-implementation)
14. [Deployment Architecture](#14-deployment-architecture)
15. [CI/CD Pipeline](#15-cicd-pipeline)
16. [Observability Design](#16-observability-design)
17. [Technical Decisions Log](#17-technical-decisions-log)

---

## 1. Architectural Overview

### Why a Modular Monolith

Recurva is built as a **modular monolith** — not microservices. This is a deliberate, reasoned choice, not a shortcut.

**Why not microservices at this stage:**

Microservices solve operational problems that arise at scale — independent deployability, team autonomy, and polyglot persistence. Recurva does not yet have those problems. Introducing microservices prematurely would impose severe costs:

- **Distributed transactions.** Billing requires atomicity across subscription state, invoice creation, charge recording, and audit logging. In a monolith, this is a single PostgreSQL transaction. In microservices, this becomes a saga pattern with compensating transactions — significant complexity for zero user-facing benefit.
- **Operational overhead.** Each service needs its own CI pipeline, Docker image, health checks, and deployment slot. On a single Oracle VPS, this would be pure overhead.
- **Network latency between services.** The billing scheduler calls subscription logic, invoice logic, dunning logic, and webhook dispatch in sequence. As in-process calls, this is nanoseconds. As HTTP calls, this is latency, failure surfaces, and retry logic.
- **Debugging difficulty.** Tracing a failed charge across five services requires distributed tracing infrastructure. Tracing it in a monolith means grepping one log file by `request_id`.

**Why a modular monolith (not a big ball of mud):**

The modules in `src/domain/` enforce the same boundaries that would exist in microservices — each module owns its data queries, its business logic, and its public interface. No module reaches into another module's query files. The difference is that these boundaries are enforced by code convention and code review, not by network boundaries. This means we keep strong module isolation while retaining all the operational simplicity of a single process.

**Migration path:** When Recurva scales to the point where, for example, the webhook delivery system needs independent scaling or a separate team, it can be extracted into a service. Because the domain boundaries are already clean, this extraction will be a refactor, not a rewrite.

---

### The Three Layers

#### API Layer — `src/api/`
The surface that faces the outside world. Responsible for:
- Receiving HTTP requests and routing them
- Authenticating the tenant via API key middleware
- Validating request bodies and parameters with Zod
- Translating domain errors into clean HTTP responses
- Emitting structured request/response logs

The API layer contains **no business logic**. It calls domain functions and maps results to HTTP responses. If a route handler is doing anything more complex than calling a domain function and returning its result, that logic belongs in the domain layer.

#### Domain Layer — `src/domain/`
The heart of the system. Responsible for:
- All business rules (subscription transitions, billing calculations, dunning policy, proration)
- The subscription state machine
- Invoice and charge computation
- Coupon and discount application
- Dunning retry scheduling

The domain layer contains **no SQL** and **no HTTP calls**. It receives plain data, applies business logic, and returns plain data or domain errors. It calls infrastructure functions (from `src/db/queries/` and `src/nomba/`) by dependency injection — it does not import them directly at the module level, making the domain layer fully testable without a database or network.

#### Infrastructure Layer — `src/db/`, `src/nomba/`, `src/scheduler/`, `src/webhooks/`
The layer that talks to the outside world. Responsible for:
- PostgreSQL queries (via postgres.js)
- Nomba API HTTP calls
- Cron scheduling and job locking
- Outbound webhook delivery

Infrastructure functions are pure I/O — they take plain inputs, perform I/O, and return plain outputs. They contain no business logic. Domain logic that needs to persist data or call Nomba calls infrastructure functions through injected dependencies.

---

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL CLIENTS                              │
│                                                                         │
│   Tenant App (API Key)    Customer Portal (JWT)    Nomba Webhooks       │
└────────────┬──────────────────────┬────────────────────────┬────────────┘
             │ HTTPS                │ HTTPS                  │ HTTPS
             ▼                      ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE (DNS + DDoS)                          │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        NGINX (Oracle VPS)                               │
│               SSL Termination · Reverse Proxy · Security Headers        │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │ HTTP (internal)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      BUN + HONO APPLICATION                             │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        API LAYER                                  │  │
│  │  RequestID → Logger → TenantAuth → Validation → RouteHandler      │  │
│  │                                                                   │  │
│  │  /v1/tenants      /v1/plans        /v1/subscriptions              │  │
│  │  /v1/customers    /v1/invoices     /v1/coupons                    │  │
│  │  /v1/usage        /v1/webhooks     /v1/portal/*                   │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
│                               │ calls                                   │
│  ┌────────────────────────────▼─────────────────────────────────────┐  │
│  │                       DOMAIN LAYER                                │  │
│  │                                                                   │  │
│  │  tenant   plan      coupon     customer   payment-method          │  │
│  │  subscription       usage      invoice    billing                 │  │
│  │  dunning  proration webhook    nomba      portal                  │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────┐     │  │
│  │  │         SUBSCRIPTION STATE MACHINE                      │     │  │
│  │  │  trialing → active → past_due → cancelled/paused        │     │  │
│  │  └─────────────────────────────────────────────────────────┘     │  │
│  └────────────────────────────┬─────────────────────────────────────┘  │
│                               │ calls                                   │
│  ┌────────────────────────────▼─────────────────────────────────────┐  │
│  │                   INFRASTRUCTURE LAYER                            │  │
│  │                                                                   │  │
│  │  ┌─────────────┐  ┌────────────────┐  ┌────────────────────┐    │  │
│  │  │  postgres.js │  │  Nomba Client  │  │  Webhook Delivery  │    │  │
│  │  │  (SQL pool) │  │  (HTTP client) │  │  (retry worker)    │    │  │
│  │  └──────┬──────┘  └───────┬────────┘  └────────┬───────────┘    │  │
│  │         │                 │                     │                  │  │
│  │  ┌──────▼──────┐  ┌───────▼────────┐  ┌────────▼───────────┐    │  │
│  │  │  PostgreSQL  │  │   Nomba API    │  │  Tenant Endpoints  │    │  │
│  │  │  (DB pool)  │  │  (payments)    │  │  (outbound HTTPS)  │    │  │
│  │  └─────────────┘  └────────────────┘  └────────────────────┘    │  │
│  │                                                                   │  │
│  │  ┌──────────────────────────────────────────────────────────┐    │  │
│  │  │                  BILLING SCHEDULER                        │    │  │
│  │  │  Bun.cron → advisory lock → billing jobs → dead letter   │    │  │
│  │  └──────────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Project Structure

```
recurva/
│
├── src/                              # All application source code
│   │
│   ├── api/                          # API layer: routes, middleware, validators
│   │   ├── app.ts                    # Hono app factory — creates and wires the app instance
│   │   ├── middleware/
│   │   │   ├── request-id.ts         # Injects unique request_id into every request context
│   │   │   ├── logger.ts             # Structured JSON request/response logger
│   │   │   ├── tenant-auth.ts        # Validates API key, loads tenant context
│   │   │   └── error-handler.ts      # Catches domain errors, maps to HTTP responses
│   │   ├── validators/
│   │   │   ├── subscription.validator.ts   # Zod schemas for subscription routes
│   │   │   ├── plan.validator.ts           # Zod schemas for plan routes
│   │   │   ├── customer.validator.ts       # Zod schemas for customer routes
│   │   │   ├── invoice.validator.ts        # Zod schemas for invoice routes
│   │   │   ├── coupon.validator.ts         # Zod schemas for coupon routes
│   │   │   ├── usage.validator.ts          # Zod schemas for usage reporting
│   │   │   └── webhook.validator.ts        # Zod schemas for webhook registration
│   │   └── routes/
│   │       ├── tenant.routes.ts      # POST /v1/tenants (public — onboarding only)
│   │       ├── plan.routes.ts        # CRUD for billing plans
│   │       ├── coupon.routes.ts      # CRUD for coupons
│   │       ├── customer.routes.ts    # CRUD for customers
│   │       ├── payment-method.routes.ts    # Attach/list/delete payment methods
│   │       ├── subscription.routes.ts      # Create, cancel, pause, resume subscriptions
│   │       ├── usage.routes.ts             # Report and query metered usage
│   │       ├── invoice.routes.ts           # List invoices, retry failed charges
│   │       └── webhook.routes.ts           # Register and list webhook endpoints
│   │
│   ├── domain/                       # Domain layer: all business logic lives here
│   │   ├── tenant/
│   │   │   ├── tenant.service.ts     # Tenant onboarding, credential storage
│   │   │   └── tenant.types.ts       # Tenant domain types
│   │   ├── plan/
│   │   │   ├── plan.service.ts       # Plan creation, pricing logic, archival
│   │   │   └── plan.types.ts
│   │   ├── coupon/
│   │   │   ├── coupon.service.ts     # Validation, discount calculation, usage tracking
│   │   │   └── coupon.types.ts
│   │   ├── customer/
│   │   │   ├── customer.service.ts   # Customer creation, lookup, deduplication
│   │   │   └── customer.types.ts
│   │   ├── payment-method/
│   │   │   ├── payment-method.service.ts   # Tokenize, list, set default, fallback logic
│   │   │   └── payment-method.types.ts
│   │   ├── subscription/
│   │   │   ├── subscription.service.ts     # Lifecycle orchestration: create, cancel, pause
│   │   │   ├── subscription.state-machine.ts   # Pure state machine: transitions + audit
│   │   │   └── subscription.types.ts
│   │   ├── usage/
│   │   │   ├── usage.service.ts      # Ingest usage records, aggregate for invoicing
│   │   │   └── usage.types.ts
│   │   ├── invoice/
│   │   │   ├── invoice.service.ts    # Invoice construction: line items, tax, discounts
│   │   │   └── invoice.types.ts
│   │   ├── billing/
│   │   │   ├── billing.service.ts    # Orchestrates invoice → charge → state transition
│   │   │   └── billing.types.ts
│   │   ├── dunning/
│   │   │   ├── dunning.service.ts    # Retry logic, Nigerian salary cycle awareness
│   │   │   ├── dunning.policy.ts     # Policy evaluator: when to retry, when to cancel
│   │   │   └── dunning.types.ts
│   │   ├── proration/
│   │   │   ├── proration.service.ts  # Calculates credit/debit on plan changes
│   │   │   └── proration.types.ts
│   │   ├── webhook/
│   │   │   ├── webhook.service.ts    # Register endpoints, sign payloads, enqueue events
│   │   │   └── webhook.types.ts
│   │   ├── nomba/
│   │   │   ├── nomba.service.ts      # Domain adapter: translates Nomba responses to domain types
│   │   │   └── nomba.types.ts        # Domain-level payment types (not Nomba-specific)
│   │   └── portal/
│   │       ├── portal.service.ts     # Customer portal session management, JWT issuance
│   │       └── portal.types.ts
│   │
│   ├── db/                           # Infrastructure: database access
│   │   ├── client.ts                 # postgres.js pool factory: one pool, configured from env
│   │   ├── migrate.ts                # Migration runner: reads /migrations/, tracks applied
│   │   ├── transaction.ts            # withTransaction() helper wrapping postgres.js
│   │   └── queries/                  # One file per domain — raw SQL, no business logic
│   │       ├── tenant.queries.ts
│   │       ├── plan.queries.ts
│   │       ├── coupon.queries.ts
│   │       ├── customer.queries.ts
│   │       ├── payment-method.queries.ts
│   │       ├── subscription.queries.ts
│   │       ├── usage.queries.ts
│   │       ├── invoice.queries.ts
│   │       ├── billing-job.queries.ts
│   │       ├── dunning.queries.ts
│   │       ├── webhook-endpoint.queries.ts
│   │       ├── webhook-delivery.queries.ts
│   │       └── audit-log.queries.ts
│   │
│   ├── nomba/                        # Infrastructure: Nomba API client
│   │   ├── client.ts                 # HTTP client factory — accepts tenant credentials
│   │   ├── adapters.ts               # Maps Nomba API responses to domain types
│   │   ├── errors.ts                 # Nomba error codes → domain error mapping
│   │   └── types.ts                  # Raw Nomba API request/response types
│   │
│   ├── scheduler/                    # Infrastructure: billing cron
│   │   ├── index.ts                  # Scheduler bootstrap — registers cron with Bun
│   │   ├── billing-runner.ts         # Main job: find due subscriptions, bill each
│   │   ├── dunning-runner.ts         # Dunning job: find past_due subs, retry
│   │   ├── webhook-runner.ts         # Webhook retry job: find failed deliveries, retry
│   │   └── lock.ts                   # PostgreSQL advisory lock helpers
│   │
│   ├── webhooks/                     # Inbound and outbound webhook handling
│   │   ├── inbound/
│   │   │   ├── handler.ts            # Nomba webhook endpoint: verify → idempotency → process
│   │   │   ├── verify.ts             # HMAC-SHA256 signature verification
│   │   │   └── processor.ts          # Event type router: payment.success, payment.failed, etc.
│   │   └── outbound/
│   │       ├── delivery.ts           # HTTP delivery with timeout, stores result
│   │       ├── signer.ts             # Signs outbound payload with tenant webhook secret
│   │       └── queue.ts              # Enqueue webhook events for delivery
│   │
│   ├── portal/                       # Customer-facing portal routes (JWT-authenticated)
│   │   ├── portal.app.ts             # Separate Hono sub-app for portal
│   │   └── routes/
│   │       ├── session.routes.ts     # POST /portal/session — issue JWT via magic link
│   │       ├── subscription.routes.ts    # GET/POST customer's own subscriptions
│   │       ├── invoice.routes.ts         # GET customer's invoices
│   │       └── payment-method.routes.ts  # Manage customer's payment methods
│   │
│   ├── dashboard/                    # Tenant dashboard routes (future: browser UI)
│   │   └── routes/                   # Placeholder for server-rendered dashboard
│   │
│   ├── config.ts                     # Environment variable loading and validation
│   ├── errors.ts                     # Domain error classes and error codes
│   ├── logger.ts                     # Structured JSON logger (wraps console with context)
│   └── index.ts                      # Entry point: starts Hono server + scheduler
│
├── tests/                            # All tests
│   ├── unit/                         # Pure function tests — no DB, no network
│   │   ├── domain/
│   │   │   ├── subscription.state-machine.test.ts
│   │   │   ├── coupon.service.test.ts
│   │   │   ├── dunning.policy.test.ts
│   │   │   └── proration.service.test.ts
│   │   └── webhooks/
│   │       └── verify.test.ts
│   ├── integration/                  # Tests against real test database
│   │   ├── subscription.test.ts      # Full subscription lifecycle
│   │   ├── billing.test.ts           # Billing run end-to-end
│   │   └── dunning.test.ts           # Dunning retry flow
│   └── helpers/
│       ├── db.ts                     # Test DB setup/teardown helpers
│       ├── nomba.mock.ts             # NombaClient test double
│       └── fixtures.ts               # Factory functions for test data
│
├── migrations/                       # Numbered SQL migration files
│   ├── 0001_create_tenants.sql
│   ├── 0002_create_plans.sql
│   ├── 0003_create_customers.sql
│   ├── 0004_create_subscriptions.sql
│   ├── 0005_create_invoices.sql
│   ├── 0006_create_usage_records.sql
│   ├── 0007_create_webhook_tables.sql
│   ├── 0008_create_dunning_tables.sql
│   ├── 0009_create_audit_log.sql
│   └── 0010_create_migrations_table.sql
│
├── docs/                             # Documentation
│   ├── ARCHITECTURE.md               # This document
│   ├── API.md                        # API reference (generated from routes)
│   └── RUNBOOK.md                    # Ops runbook: deploy, rollback, incident response
│
├── docker/                           # Docker configuration
│   ├── app.Dockerfile                # Multi-stage Bun app image
│   ├── nginx.conf                    # Nginx reverse proxy + SSL config
│   └── postgres-init.sql             # DB init script for local dev
│
├── .github/
│   └── workflows/
│       ├── pr.yml                    # PR checks: typecheck, lint, unit + integration tests
│       ├── staging.yml               # Staging deploy on merge to staging branch
│       └── production.yml            # Production deploy on merge to main
│
├── docker-compose.yml                # Local dev and production service definitions
├── docker-compose.test.yml           # Test environment with ephemeral DB
├── .env.example                      # Template — never commit real .env
├── tsconfig.json                     # TypeScript config
├── bunfig.toml                       # Bun runtime configuration
└── package.json                      # Dependencies and scripts
```

---

## 3. Domain Module Design

### Module: `tenant`

**Owns:** Tenant records, hashed API keys, Nomba credential storage (encrypted), tenant configuration (dunning policy, webhook settings).

**Does NOT own:** Customer data, subscription data, billing logic.

**Public interface:**
```typescript
export async function createTenant(input: CreateTenantInput): Promise<Tenant>
export async function getTenantByApiKey(rawKey: string): Promise<Tenant | null>
export async function getTenantById(tenantId: string): Promise<Tenant | null>
export async function updateTenantNombaCredentials(tenantId: string, creds: NombaCredentials): Promise<void>
export async function updateDunningPolicy(tenantId: string, policy: DunningPolicy): Promise<void>
```

**Dependencies:** `db/queries/tenant.queries.ts`

**Why this boundary exists:** Tenant is the root of the multi-tenant tree. Every other entity references `tenant_id`. Keeping tenant logic isolated ensures API key validation and credential lookup never leaks into billing logic.

---

### Module: `plan`

**Owns:** Plan definitions (price, interval, currency, metered components, trial period), plan archival.

**Does NOT own:** Subscription state, customer data.

**Public interface:**
```typescript
export async function createPlan(tenantId: string, input: CreatePlanInput): Promise<Plan>
export async function getPlan(tenantId: string, planId: string): Promise<Plan | null>
export async function listPlans(tenantId: string): Promise<Plan[]>
export async function archivePlan(tenantId: string, planId: string): Promise<void>
```

**Dependencies:** `db/queries/plan.queries.ts`

**Why this boundary exists:** Plan definitions are read-only once subscriptions exist on them. Archiving a plan does not affect existing subscriptions — only prevents new ones.

---

### Module: `coupon`

**Owns:** Coupon definitions, redemption validation, usage counting, discount calculation.

**Does NOT own:** Invoice construction, subscription state.

**Public interface:**
```typescript
export async function createCoupon(tenantId: string, input: CreateCouponInput): Promise<Coupon>
export async function validateCoupon(tenantId: string, code: string): Promise<CouponValidationResult>
export async function applyDiscount(amount: number, coupon: Coupon): Promise<DiscountResult>
export async function recordRedemption(tenantId: string, couponId: string, subscriptionId: string): Promise<void>
export async function decrementUsage(tenantId: string, couponId: string): Promise<void>
```

**Dependencies:** `db/queries/coupon.queries.ts`

**Why this boundary exists:** Coupon application logic (percentage vs. fixed, repeating vs. once) is complex enough to warrant isolation. Invoice module calls `applyDiscount()` without needing to know how discounts are structured.

---

### Module: `customer`

**Owns:** Customer records (name, email, metadata), deduplication by email within a tenant.

**Does NOT own:** Payment methods (separate module), subscription state.

**Public interface:**
```typescript
export async function createCustomer(tenantId: string, input: CreateCustomerInput): Promise<Customer>
export async function getCustomer(tenantId: string, customerId: string): Promise<Customer | null>
export async function getCustomerByEmail(tenantId: string, email: string): Promise<Customer | null>
export async function listCustomers(tenantId: string, pagination: Pagination): Promise<PaginatedResult<Customer>>
export async function updateCustomer(tenantId: string, customerId: string, input: UpdateCustomerInput): Promise<Customer>
```

**Dependencies:** `db/queries/customer.queries.ts`

**Why this boundary exists:** Customer identity management has its own concerns (deduplication, PII handling) that should not be mixed with billing or subscription logic.

---

### Module: `payment-method`

**Owns:** Tokenized payment method references (Nomba token, card metadata), default method selection, fallback method list.

**Does NOT own:** Charging logic (belongs in billing), Nomba tokenization (belongs in nomba module).

**Public interface:**
```typescript
export async function attachPaymentMethod(tenantId: string, customerId: string, nombaToken: string): Promise<PaymentMethod>
export async function listPaymentMethods(tenantId: string, customerId: string): Promise<PaymentMethod[]>
export async function getDefaultPaymentMethod(tenantId: string, customerId: string): Promise<PaymentMethod | null>
export async function setDefaultPaymentMethod(tenantId: string, customerId: string, methodId: string): Promise<void>
export async function deletePaymentMethod(tenantId: string, methodId: string): Promise<void>
export async function getFallbackMethods(tenantId: string, customerId: string, excludeMethodId: string): Promise<PaymentMethod[]>
```

**Dependencies:** `db/queries/payment-method.queries.ts`, `nomba.service.ts`

**Why this boundary exists:** Payment method lifecycle is independent of subscription state. A customer can add/remove cards at any time, including mid-dunning (self-cure detection).

---

### Module: `subscription`

**Owns:** Subscription lifecycle, state machine, audit log for state transitions.

**Does NOT own:** Invoice construction (invoice module), charge execution (billing module), dunning retry schedule (dunning module).

**Public interface:**
```typescript
export async function createSubscription(tenantId: string, input: CreateSubscriptionInput): Promise<Subscription>
export async function getSubscription(tenantId: string, subscriptionId: string): Promise<Subscription | null>
export async function cancelSubscription(tenantId: string, subscriptionId: string, options: CancelOptions): Promise<Subscription>
export async function pauseSubscription(tenantId: string, subscriptionId: string): Promise<Subscription>
export async function resumeSubscription(tenantId: string, subscriptionId: string): Promise<Subscription>
export async function transitionState(tenantId: string, subscriptionId: string, event: SubscriptionEvent, context: TransitionContext): Promise<Subscription>
export async function listDueForBilling(asOf: Date): Promise<SubscriptionBillingJob[]>
```

**Dependencies:** `db/queries/subscription.queries.ts`, `subscription.state-machine.ts`, `db/queries/audit-log.queries.ts`

**Why this boundary exists:** Subscription state is the most critical, most audited concept in the system. Isolating it in its own module with a formal state machine prevents ad-hoc state mutation anywhere else in the codebase.

---

### Module: `usage`

**Owns:** Metered usage records (per subscription, per billing period), aggregation queries.

**Does NOT own:** Invoice construction, billing period definitions (owned by plan/subscription).

**Public interface:**
```typescript
export async function reportUsage(tenantId: string, input: ReportUsageInput): Promise<UsageRecord>
export async function aggregateUsage(tenantId: string, subscriptionId: string, periodStart: Date, periodEnd: Date): Promise<UsageAggregation>
export async function getUsageSummary(tenantId: string, subscriptionId: string): Promise<UsageSummary>
```

**Dependencies:** `db/queries/usage.queries.ts`

**Why this boundary exists:** Metered billing is an optional, additive concern. Keeping usage records isolated means metered logic can be added or removed without touching subscription or invoice logic.

---

### Module: `invoice`

**Owns:** Invoice construction (line items, tax, coupons, totals), invoice records, PDF generation (future).

**Does NOT own:** Charge execution (billing module), dunning (dunning module).

**Public interface:**
```typescript
export async function buildInvoice(tenantId: string, subscription: Subscription, options: BuildInvoiceOptions): Promise<Invoice>
export async function finalizeInvoice(tenantId: string, invoiceId: string): Promise<Invoice>
export async function listInvoices(tenantId: string, customerId: string, pagination: Pagination): Promise<PaginatedResult<Invoice>>
export async function getInvoice(tenantId: string, invoiceId: string): Promise<Invoice | null>
export async function voidInvoice(tenantId: string, invoiceId: string): Promise<void>
```

**Dependencies:** `db/queries/invoice.queries.ts`, `coupon.service.ts`, `usage.service.ts`, `proration.service.ts`

**Why this boundary exists:** Invoice construction is purely a calculation concern. Separating it from charge execution means an invoice can be previewed, voided, or corrected without triggering a charge.

---

### Module: `billing`

**Owns:** The billing orchestration flow: build invoice → attempt charge → update subscription state → write audit log → dispatch webhook.

**Does NOT own:** Any individual step of that flow — it delegates to the relevant module for each step.

**Public interface:**
```typescript
export async function billSubscription(tenantId: string, subscriptionId: string, context: BillingContext): Promise<BillingResult>
export async function retryCharge(tenantId: string, invoiceId: string): Promise<BillingResult>
```

**Dependencies:** `invoice.service.ts`, `nomba.service.ts`, `subscription.service.ts`, `dunning.service.ts`, `webhook.service.ts`, `db/queries/billing-job.queries.ts`

**Why this boundary exists:** Billing is a multi-step transaction that crosses module boundaries. Having a single orchestrator (rather than having invoice module call nomba, or subscription module call invoice) makes the flow legible and auditable.

---

### Module: `dunning`

**Owns:** Dunning attempt records, retry schedule calculation, policy evaluation, Nigerian salary cycle timing.

**Does NOT own:** Charge execution (billing module), subscription state transitions (subscription module).

**Public interface:**
```typescript
export async function initiateDunning(tenantId: string, subscriptionId: string, invoiceId: string): Promise<DunningAttempt>
export async function getNextRetryTime(tenantId: string, subscriptionId: string): Promise<Date>
export async function recordAttempt(tenantId: string, subscriptionId: string, result: DunningAttemptResult): Promise<void>
export async function evaluatePolicy(tenantId: string, subscriptionId: string): Promise<DunningPolicyDecision>
export async function detectSelfCure(tenantId: string, subscriptionId: string): Promise<boolean>
```

**Dependencies:** `db/queries/dunning.queries.ts`, `dunning.policy.ts`

**Why this boundary exists:** Dunning policy is tenant-configurable and culturally contextual. Isolating it allows tenants to set their own retry windows without touching billing logic.

---

### Module: `proration`

**Owns:** Credit/debit calculations when a customer changes plans mid-cycle.

**Does NOT own:** Invoice construction, subscription state.

**Public interface:**
```typescript
export function calculateProration(currentPlan: Plan, newPlan: Plan, cycleStart: Date, changeDate: Date, cycleEnd: Date): ProrationResult
```

**Dependencies:** None (pure calculation — no DB, no HTTP)

**Why this boundary exists:** Proration is complex maths. Pure functions are trivially testable and the isolation forces correctness.

---

### Module: `webhook`

**Owns:** Webhook endpoint registration, outbound event signing, delivery queue insertion.

**Does NOT own:** Actual delivery (webhook delivery worker in infrastructure layer).

**Public interface:**
```typescript
export async function registerEndpoint(tenantId: string, input: RegisterEndpointInput): Promise<WebhookEndpoint>
export async function listEndpoints(tenantId: string): Promise<WebhookEndpoint[]>
export async function enqueueEvent(tenantId: string, eventType: string, payload: Record<string, unknown>): Promise<void>
export function signPayload(secret: string, payload: string): string
```

**Dependencies:** `db/queries/webhook-endpoint.queries.ts`, `db/queries/webhook-delivery.queries.ts`

**Why this boundary exists:** Webhook delivery is an eventually-consistent concern. Domain events enqueue to a delivery table; a separate worker handles delivery and retries without blocking the main request path.

---

### Module: `nomba`

**Owns:** Translation between domain concepts and Nomba API concepts. Error mapping.

**Does NOT own:** Business rules about what to charge — receives exact amounts from billing module.

**Public interface:**
```typescript
export async function chargeCard(credentials: NombaCredentials, input: ChargeInput): Promise<ChargeResult>
export async function tokenizeCard(credentials: NombaCredentials, input: TokenizeInput): Promise<CardToken>
export async function refund(credentials: NombaCredentials, chargeId: string, amount: number): Promise<RefundResult>
export async function getCharge(credentials: NombaCredentials, chargeId: string): Promise<ChargeResult>
```

**Dependencies:** `nomba/client.ts`, `nomba/adapters.ts`, `nomba/errors.ts`

**Why this boundary exists:** Nomba is an external dependency. Wrapping it in a domain adapter means the rest of the codebase speaks domain types. If Nomba's API changes, only this module changes.

---

### Module: `portal`

**Owns:** Customer portal session management, JWT issuance and verification, scoped access to customer's own data.

**Does NOT own:** Customer data (reads from customer module), subscription data (reads from subscription module).

**Public interface:**
```typescript
export async function issuePortalSession(tenantId: string, customerId: string): Promise<PortalSession>
export async function verifyPortalToken(token: string): Promise<PortalClaims>
export async function sendMagicLink(tenantId: string, email: string): Promise<void>
```

**Dependencies:** `customer.service.ts`, JWT library

**Why this boundary exists:** Customer portal authentication is entirely separate from API key authentication. Mixing them would create a security boundary violation — a customer authenticating to the portal must never be able to see another tenant's data.

---

## 4. Subscription State Machine Implementation

### States and Events

```
States:
  trialing      — In free trial period, not yet billed
  active        — Paid and current
  past_due      — Payment failed, in dunning
  paused        — Tenant-requested or customer-requested pause
  cancelled     — Permanently ended
  incomplete    — Created but initial payment pending (async charge)

Events:
  TRIAL_END           — Trial period expires
  PAYMENT_SUCCESS     — Charge succeeded
  PAYMENT_FAILED      — Charge failed
  CANCEL              — Explicit cancellation request
  PAUSE               — Pause request
  RESUME              — Resume request
  MAX_DUNNING_REACHED — Dunning gave up
  REACTIVATE          — Customer comes back after cancellation
```

### Transition Table

```typescript
// src/domain/subscription/subscription.state-machine.ts

type SubscriptionState =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'cancelled'
  | 'incomplete';

type SubscriptionEvent =
  | 'TRIAL_END'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'CANCEL'
  | 'PAUSE'
  | 'RESUME'
  | 'MAX_DUNNING_REACHED'
  | 'REACTIVATE';

interface TransitionResult {
  nextState: SubscriptionState;
  sideEffects: SideEffect[];
}

// The transition table is the complete specification of allowed state changes.
// Any combination NOT in this table is an invalid transition.
const TRANSITION_TABLE: Record<
  SubscriptionState,
  Partial<Record<SubscriptionEvent, TransitionResult>>
> = {
  trialing: {
    TRIAL_END:       { nextState: 'active',    sideEffects: ['BILL_NOW'] },
    PAYMENT_SUCCESS: { nextState: 'active',    sideEffects: ['ACTIVATE'] },
    PAYMENT_FAILED:  { nextState: 'past_due',  sideEffects: ['START_DUNNING'] },
    CANCEL:          { nextState: 'cancelled', sideEffects: ['CANCEL_IMMEDIATELY'] },
    PAUSE:           { nextState: 'paused',    sideEffects: ['PAUSE_TRIAL'] },
  },
  active: {
    PAYMENT_FAILED:  { nextState: 'past_due',  sideEffects: ['START_DUNNING'] },
    CANCEL:          { nextState: 'cancelled', sideEffects: ['SCHEDULE_CANCELLATION'] },
    PAUSE:           { nextState: 'paused',    sideEffects: ['PAUSE_BILLING'] },
  },
  past_due: {
    PAYMENT_SUCCESS: { nextState: 'active',    sideEffects: ['CLEAR_DUNNING', 'ACTIVATE'] },
    MAX_DUNNING_REACHED: { nextState: 'cancelled', sideEffects: ['CANCEL_IMMEDIATELY', 'NOTIFY_TENANT'] },
    CANCEL:          { nextState: 'cancelled', sideEffects: ['CANCEL_IMMEDIATELY'] },
  },
  paused: {
    RESUME:          { nextState: 'active',    sideEffects: ['RESUME_BILLING'] },
    CANCEL:          { nextState: 'cancelled', sideEffects: ['CANCEL_IMMEDIATELY'] },
  },
  cancelled: {
    REACTIVATE:      { nextState: 'active',    sideEffects: ['CREATE_NEW_CYCLE'] },
  },
  incomplete: {
    PAYMENT_SUCCESS: { nextState: 'active',    sideEffects: ['ACTIVATE'] },
    PAYMENT_FAILED:  { nextState: 'cancelled', sideEffects: ['CANCEL_IMMEDIATELY'] },
    CANCEL:          { nextState: 'cancelled', sideEffects: ['CANCEL_IMMEDIATELY'] },
  },
};
```

### Transition Execution

```typescript
export class InvalidTransitionError extends Error {
  constructor(
    public readonly fromState: SubscriptionState,
    public readonly event: SubscriptionEvent
  ) {
    super(`Invalid transition: ${fromState} + ${event}`);
  }
}

export function applyTransition(
  currentState: SubscriptionState,
  event: SubscriptionEvent
): TransitionResult {
  const stateTransitions = TRANSITION_TABLE[currentState];
  const result = stateTransitions?.[event];

  if (!result) {
    throw new InvalidTransitionError(currentState, event);
  }

  return result;
}
```

### Audit Logging

Every transition is written to the `subscription_audit_log` table inside the same database transaction as the state update. This means there is no possibility of a state change without a corresponding audit record.

```typescript
export async function transitionState(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  event: SubscriptionEvent,
  context: TransitionContext
): Promise<Subscription> {
  return withTransaction(sql, async (tx) => {
    // 1. Load current state with row lock
    const subscription = await getSubscriptionForUpdate(tx, tenantId, subscriptionId);

    // 2. Apply transition (throws InvalidTransitionError if not allowed)
    const { nextState, sideEffects } = applyTransition(subscription.status, event);

    // 3. Update subscription state
    const updated = await updateSubscriptionStatus(tx, tenantId, subscriptionId, nextState);

    // 4. Write audit log in the SAME transaction
    await writeAuditLog(tx, {
      tenantId,
      entityType: 'subscription',
      entityId: subscriptionId,
      event,
      fromState: subscription.status,
      toState: nextState,
      context,
      occurredAt: new Date(),
    });

    // 5. Enqueue webhook event (outbox pattern — stored in DB, delivered async)
    await enqueueWebhookEvent(tx, tenantId, `subscription.${event.toLowerCase()}`, {
      subscriptionId,
      previousStatus: subscription.status,
      status: nextState,
    });

    return updated;
  });
}
```

### Webhook Events from Transitions

Webhook events are not dispatched inline — they are written to a `webhook_deliveries` table inside the same transaction as the state change (outbox pattern). A separate delivery worker reads this table and dispatches to tenant endpoints. This guarantees that if a state change commits, the webhook event will eventually be delivered, even if the process crashes immediately after.

---

## 5. Data Layer Design

### Why Raw SQL Over an ORM

This is a deliberate choice. The decision was evaluated against Drizzle and Prisma.

**The core argument against ORMs in a billing system:**

Billing systems require precise, audited, correct SQL. An ORM creates an abstraction layer between the engineer and the database. In billing, you need to know exactly what SQL is running — not approximately, not "probably this". Consider:

- **Advisory locks:** PostgreSQL advisory locks (`pg_try_advisory_xact_lock`) are critical for preventing duplicate billing runs. No ORM exposes this natively.
- **`FOR UPDATE SKIP LOCKED`:** Used in the billing scheduler to claim subscription rows without blocking. This is a PostgreSQL-specific pattern that ORMs either don't support or bury behind escape hatches.
- **Window functions:** Usage aggregation uses `SUM() OVER (PARTITION BY ...)` patterns. Writing these through an ORM query builder is awkward and produces unreadable code.
- **Explicit transaction control:** Billing requires transactions that span subscription update + invoice creation + audit log write. With raw SQL, this is fully explicit. With an ORM, transaction semantics can be implicit and surprising.
- **No migration magic:** ORM migrations that auto-detect schema changes and generate SQL are dangerous in production. Every schema change in Recurva is a reviewed, numbered SQL file.

**Raw SQL is not unsafe if done correctly.** The safety comes from using postgres.js's tagged template literal pattern, which parameterizes all values by default:

```typescript
// CORRECT — postgres.js parameterizes automatically
const result = await sql`
  SELECT * FROM subscriptions
  WHERE tenant_id = ${tenantId}
  AND id = ${subscriptionId}
`;

// WRONG — never do this — SQL injection vulnerability
const result = await sql`
  SELECT * FROM subscriptions
  WHERE tenant_id = '${tenantId}'
  AND id = '${subscriptionId}'
`;
```

The tagged template approach means it is structurally impossible to produce an injection vulnerability through normal usage.

---

### postgres.js Configuration

```typescript
// src/db/client.ts
import postgres from 'postgres';
import { config } from '../config';

let _sql: ReturnType<typeof postgres> | null = null;

export function getDb(): ReturnType<typeof postgres> {
  if (!_sql) {
    _sql = postgres(config.DATABASE_URL, {
      max: 20,                    // Max pool connections — sized for Oracle VPS (4 vCPU)
      idle_timeout: 20,           // Close idle connections after 20 seconds
      connect_timeout: 10,        // Fail fast if DB is unreachable
      max_lifetime: 1800,         // Recycle connections after 30 minutes (prevents stale)
      ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : false,
      transform: postgres.camel,  // snake_case columns → camelCase JS properties
      types: {
        // Ensure numeric columns return JS numbers, not strings
        numeric: {
          to: 0,
          from: [1700], // PostgreSQL numeric OID
          serialize: (n: number) => String(n),
          parse: (s: string) => parseFloat(s),
        },
      },
      onnotice: (notice) => logger.debug({ event: 'db.notice', notice }),
    });
  }
  return _sql;
}
```

---

### Query File Pattern

Each domain has exactly one query file. Query files contain only SQL — no business logic, no conditional logic beyond what belongs in SQL, no external function calls.

```typescript
// src/db/queries/subscriptions.queries.ts

import type { Sql } from 'postgres';
import type { Subscription, SubscriptionStatus } from '../../domain/subscription/subscription.types';

// ─── Read ──────────────────────────────────────────────────────────────────────

export async function findSubscriptionById(
  sql: Sql,
  tenantId: string,
  subscriptionId: string
): Promise<Subscription | null> {
  const [row] = await sql<Subscription[]>`
    SELECT
      id, tenant_id, customer_id, plan_id, status,
      current_period_start, current_period_end,
      trial_start, trial_end, cancelled_at,
      created_at, updated_at
    FROM subscriptions
    WHERE tenant_id = ${tenantId}
      AND id = ${subscriptionId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function findSubscriptionForUpdate(
  sql: Sql,
  tenantId: string,
  subscriptionId: string
): Promise<Subscription | null> {
  // FOR UPDATE acquires a row-level lock, preventing concurrent state transitions
  const [row] = await sql<Subscription[]>`
    SELECT * FROM subscriptions
    WHERE tenant_id = ${tenantId}
      AND id = ${subscriptionId}
    FOR UPDATE
    LIMIT 1
  `;
  return row ?? null;
}

export async function findDueForBilling(
  sql: Sql,
  asOf: Date,
  limit: number = 100
): Promise<Subscription[]> {
  // FOR UPDATE SKIP LOCKED — claim rows without blocking concurrent scheduler instances
  return sql<Subscription[]>`
    SELECT s.*
    FROM subscriptions s
    WHERE s.status IN ('active', 'trialing')
      AND s.current_period_end <= ${asOf}
      AND NOT EXISTS (
        SELECT 1 FROM billing_jobs bj
        WHERE bj.subscription_id = s.id
          AND bj.status = 'processing'
      )
    ORDER BY s.current_period_end ASC
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  `;
}

// ─── Write ─────────────────────────────────────────────────────────────────────

export async function updateSubscriptionStatus(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  status: SubscriptionStatus
): Promise<Subscription> {
  const [updated] = await sql<Subscription[]>`
    UPDATE subscriptions
    SET
      status = ${status},
      updated_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND id = ${subscriptionId}
    RETURNING *
  `;
  if (!updated) throw new Error(`Subscription ${subscriptionId} not found`);
  return updated;
}

export async function updateSubscriptionPeriod(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<Subscription> {
  const [updated] = await sql<Subscription[]>`
    UPDATE subscriptions
    SET
      current_period_start = ${periodStart},
      current_period_end = ${periodEnd},
      updated_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND id = ${subscriptionId}
    RETURNING *
  `;
  if (!updated) throw new Error(`Subscription ${subscriptionId} not found`);
  return updated;
}
```

---

### Migration Strategy

Migrations are numbered SQL files in `/migrations/`. A migration runner tracks which have been applied in a `schema_migrations` table.

```typescript
// src/db/migrate.ts
export async function runMigrations(sql: Sql): Promise<void> {
  // Ensure migrations table exists
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Find applied migrations
  const applied = await sql<{ filename: string }[]>`
    SELECT filename FROM schema_migrations ORDER BY filename
  `;
  const appliedSet = new Set(applied.map(r => r.filename));

  // Read migration files from disk
  const files = readdirSync('./migrations')
    .filter(f => f.endsWith('.sql'))
    .sort(); // lexicographic sort preserves numeric order

  for (const file of files) {
    if (appliedSet.has(file)) continue;

    logger.info({ event: 'migration.start', file });
    const migrationSql = readFileSync(`./migrations/${file}`, 'utf-8');

    await sql.begin(async (tx) => {
      await tx.unsafe(migrationSql);  // .unsafe() needed for DDL statements
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });

    logger.info({ event: 'migration.applied', file });
  }
}
```

Migrations run automatically at application startup before the HTTP server begins accepting requests.

---

### Transaction Design

The rule is simple: **if two or more tables are written to as part of a single logical operation, they must be in a transaction.**

Operations that require transactions:
- Subscription state transition + audit log write + webhook event enqueue
- Invoice creation + line item creation
- Billing run: invoice finalize + charge record + subscription period advance
- Coupon redemption + usage count decrement

```typescript
// src/db/transaction.ts
import type { Sql } from 'postgres';

export async function withTransaction<T>(
  sql: Sql,
  fn: (tx: Sql) => Promise<T>
): Promise<T> {
  return sql.begin(async (tx) => {
    return fn(tx);
  });
}

// Usage:
await withTransaction(sql, async (tx) => {
  const invoice = await createInvoice(tx, tenantId, invoiceData);
  await createInvoiceLineItems(tx, tenantId, invoice.id, lineItems);
  await writeAuditLog(tx, { event: 'invoice.created', entityId: invoice.id, ... });
});
```

---

### Multi-Tenant Isolation

Every query that touches a tenant-scoped table must include `tenant_id`. This is not optional — it is enforced by convention and by code review. The pattern is:

1. Every tenant-scoped table has a `tenant_id UUID NOT NULL` column with an index.
2. Every query function in `src/db/queries/` takes `tenantId` as an explicit parameter.
3. There is no query function that fetches tenant data without a `tenantId` argument (except internal admin functions, which are separately scoped).

```typescript
// CORRECT — tenant_id on every query
export async function findCustomer(sql: Sql, tenantId: string, customerId: string) {
  return sql`SELECT * FROM customers WHERE tenant_id = ${tenantId} AND id = ${customerId}`;
}

// WRONG — missing tenant_id, would leak data across tenants
export async function findCustomer(sql: Sql, customerId: string) {
  return sql`SELECT * FROM customers WHERE id = ${customerId}`;  // BUG
}
```

---

## 6. Nomba Client Design

### Client Structure

The Nomba client is a factory function that accepts tenant credentials and returns a typed client. There is no global Nomba client — the client is instantiated per request with the tenant's credentials.

```typescript
// src/nomba/client.ts

export interface NombaCredentials {
  accountId: string;
  clientId: string;
  clientSecret: string;       // Decrypted at request time — never stored in memory globally
  environment: 'sandbox' | 'live';
}

export interface NombaClient {
  chargeCard(input: ChargeCardInput): Promise<NombaChargeResponse>;
  tokenizeCard(input: TokenizeCardInput): Promise<NombaTokenResponse>;
  refund(chargeId: string, amount: number): Promise<NombaRefundResponse>;
  getCharge(chargeId: string): Promise<NombaChargeResponse>;
}

export function createNombaClient(credentials: NombaCredentials): NombaClient {
  const baseUrl = credentials.environment === 'live'
    ? 'https://api.nomba.com/v1'
    : 'https://sandbox.api.nomba.com/v1';

  async function fetchWithRetry(
    path: string,
    options: RequestInit,
    attempt = 1
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.clientSecret}`,
          'X-Account-Id': credentials.accountId,
          ...options.headers,
        },
      });
      clearTimeout(timeout);

      // Retry on 5xx (server errors) but not on 4xx (client errors)
      if (res.status >= 500 && attempt < 3) {
        const delay = attempt * 1000; // 1s, 2s
        await new Promise(r => setTimeout(r, delay));
        return fetchWithRetry(path, options, attempt + 1);
      }

      return res;
    } catch (err) {
      clearTimeout(timeout);
      if (attempt < 3 && isRetryableError(err)) {
        await new Promise(r => setTimeout(r, attempt * 1000));
        return fetchWithRetry(path, options, attempt + 1);
      }
      throw err;
    }
  }

  return {
    async chargeCard(input) {
      const res = await fetchWithRetry('/charges', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw mapNombaError(data, res.status);
      return data;
    },
    // ... other methods
  };
}
```

### Tenant Credential Injection

Nomba credentials are stored encrypted in the `tenants` table. They are decrypted at request time by the tenant auth middleware and attached to the request context:

```typescript
// src/api/middleware/tenant-auth.ts
app.use('*', async (c, next) => {
  const apiKey = c.req.header('X-API-Key');
  const tenant = await getTenantByApiKey(apiKey);
  
  const nombaCredentials = decryptCredentials(tenant.encryptedNombaCredentials);
  
  c.set('tenant', tenant);
  c.set('nombaCredentials', nombaCredentials);  // Available to all handlers
  c.set('nombaClient', createNombaClient(nombaCredentials));  // Per-request client
  
  await next();
  
  // Credentials live only for the duration of the request
  // Garbage collected when request context is destroyed
});
```

### Error Mapping

```typescript
// src/nomba/errors.ts

export type NombaErrorCode =
  | 'INSUFFICIENT_FUNDS'
  | 'CARD_DECLINED'
  | 'INVALID_CARD'
  | 'EXPIRED_CARD'
  | 'DO_NOT_HONOUR'
  | 'TECHNICAL_ERROR';

export class DomainPaymentError extends Error {
  constructor(
    public readonly code: NombaErrorCode,
    public readonly nombaCode: string,
    public readonly retryable: boolean,
    message: string
  ) {
    super(message);
  }
}

export function mapNombaError(body: unknown, status: number): DomainPaymentError {
  const nombaCode = (body as any)?.code ?? 'UNKNOWN';
  
  const mapping: Record<string, { code: NombaErrorCode; retryable: boolean }> = {
    'INSUFFICIENT_FUNDS': { code: 'INSUFFICIENT_FUNDS', retryable: true },
    'DO_NOT_HONOUR':      { code: 'DO_NOT_HONOUR',      retryable: true },
    'CARD_DECLINED':      { code: 'CARD_DECLINED',       retryable: false },
    'EXPIRED_CARD':       { code: 'EXPIRED_CARD',        retryable: false },
    'INVALID_CARD':       { code: 'INVALID_CARD',        retryable: false },
  };
  
  const mapped = mapping[nombaCode] ?? { code: 'TECHNICAL_ERROR', retryable: status >= 500 };
  return new DomainPaymentError(mapped.code, nombaCode, mapped.retryable, `Nomba error: ${nombaCode}`);
}
```

### Mocking in Tests

```typescript
// tests/helpers/nomba.mock.ts

export interface NombaClientMock {
  chargeCard: jest.Mock;
  tokenizeCard: jest.Mock;
  refund: jest.Mock;
  getCharge: jest.Mock;
}

export function createNombaClientMock(overrides?: Partial<NombaClientMock>): NombaClient {
  return {
    chargeCard: mock(() => Promise.resolve({ id: 'charge_test_123', status: 'success', amount: 5000 })),
    tokenizeCard: mock(() => Promise.resolve({ token: 'tok_test_123', last4: '4242' })),
    refund: mock(() => Promise.resolve({ id: 'ref_test_123', status: 'success' })),
    getCharge: mock(() => Promise.resolve({ id: 'charge_test_123', status: 'success', amount: 5000 })),
    ...overrides,
  };
}

// In tests:
const nombaClient = createNombaClientMock({
  chargeCard: mock(() => Promise.reject(
    new DomainPaymentError('INSUFFICIENT_FUNDS', 'INSUFFICIENT_FUNDS', true, 'NSF')
  )),
});
```

---

## 7. Billing Scheduler Design

### Bun Native Scheduler

The billing scheduler uses Bun's native `Bun.cron()` API (available in Bun 1.1+). This avoids the overhead of a separate job queue system (Redis + BullMQ) while providing cron scheduling natively.

```typescript
// src/scheduler/index.ts
import { billingRunner } from './billing-runner';
import { dunningRunner } from './dunning-runner';
import { webhookRunner } from './webhook-runner';

export function startScheduler(): void {
  // Main billing run: every hour at :00
  Bun.cron('0 * * * *', billingRunner);
  
  // Dunning retry runner: every 30 minutes
  Bun.cron('*/30 * * * *', dunningRunner);
  
  // Webhook retry delivery: every 5 minutes
  Bun.cron('*/5 * * * *', webhookRunner);

  logger.info({ event: 'scheduler.started' });
}
```

### Finding Subscriptions Due for Billing

```typescript
// src/scheduler/billing-runner.ts
export async function billingRunner(): Promise<void> {
  const sql = getDb();
  const lockKey = 1001; // Arbitrary consistent integer for this job type

  // Attempt advisory lock — if another instance holds it, skip this run
  const [{ acquired }] = await sql<[{ acquired: boolean }]>`
    SELECT pg_try_advisory_lock(${lockKey}) AS acquired
  `;
  
  if (!acquired) {
    logger.info({ event: 'scheduler.billing.skipped', reason: 'lock_held' });
    return;
  }

  try {
    await runBillingCycle(sql);
  } finally {
    // Always release the lock, even if the job fails
    await sql`SELECT pg_advisory_unlock(${lockKey})`;
  }
}

async function runBillingCycle(sql: Sql): Promise<void> {
  const asOf = new Date();
  const limit = 100; // Process in batches to avoid memory pressure
  
  let processed = 0;
  let errors = 0;

  while (true) {
    // findDueForBilling uses FOR UPDATE SKIP LOCKED
    const subscriptions = await findDueForBilling(sql, asOf, limit);
    if (subscriptions.length === 0) break;

    for (const subscription of subscriptions) {
      try {
        await billSubscription(subscription.tenantId, subscription.id, { triggeredBy: 'scheduler' });
        processed++;
      } catch (err) {
        errors++;
        logger.error({
          event: 'scheduler.billing.job_failed',
          subscriptionId: subscription.id,
          tenantId: subscription.tenantId,
          error: err,
        });
        // Write to dead letter table — do NOT rethrow
        await writeDeadLetter(sql, subscription.id, err);
      }
    }

    if (subscriptions.length < limit) break; // Last page
  }

  logger.info({ event: 'scheduler.billing.cycle_complete', processed, errors });
}
```

### Job Locking

PostgreSQL advisory locks (`pg_try_advisory_lock`) prevent multiple scheduler instances from running the same job type concurrently. The lock is:

- Session-scoped (automatically released if the DB connection drops)
- Non-blocking (`pg_try_advisory_lock` returns `false` immediately if the lock is held, rather than waiting)
- Released explicitly in the `finally` block

### Crash Recovery

If the scheduler crashes mid-run:

1. The advisory lock is automatically released when the DB connection closes (session-scoped lock).
2. The next scheduled run (1 hour later) picks up any subscriptions that were not yet billed.
3. Subscriptions that were in-progress (billing job status = `processing`) are cleaned up by a startup check that marks them as `failed` if they're older than 30 minutes.

### Dead Letter Pattern

Failed billing jobs are written to `billing_job_dead_letters`. They contain the subscription ID, tenant ID, error message, stack trace, and failure count. The dead letter table is surfaced in the tenant dashboard for manual review and retry.

### Testing the Scheduler Without Real Time

```typescript
// tests/integration/billing.test.ts
import { runBillingCycle } from '../../src/scheduler/billing-runner';

test('bills subscription due in the past', async () => {
  const sql = getTestDb();
  
  // Create subscription with current_period_end in the past
  const subscription = await createTestSubscription(sql, {
    status: 'active',
    currentPeriodEnd: new Date('2024-01-01'), // Past date
  });
  
  // Run the billing cycle directly — no cron, no waiting
  await runBillingCycle(sql);
  
  // Assert subscription was billed
  const updated = await findSubscriptionById(sql, subscription.tenantId, subscription.id);
  expect(updated.status).toBe('active');
  expect(updated.currentPeriodEnd > subscription.currentPeriodEnd).toBe(true);
});
```

---

## 8. Dunning Engine Design

### Policy Storage

The dunning policy is stored as a JSONB column on the `tenants` table, allowing per-tenant customization:

```json
{
  "maxAttempts": 4,
  "retryIntervalHours": [24, 72, 168, 336],
  "cancelAfterMaxAttempts": true,
  "salaryCycleAware": true,
  "backupCardFallback": true,
  "notifyCustomerOnFailure": true
}
```

### Retry Timing Calculation

```typescript
// src/domain/dunning/dunning.policy.ts

export function calculateNextRetryTime(
  policy: DunningPolicy,
  attemptNumber: number,     // 0-indexed
  lastAttemptAt: Date
): Date {
  const baseIntervalHours = policy.retryIntervalHours[attemptNumber]
    ?? policy.retryIntervalHours[policy.retryIntervalHours.length - 1];

  let nextRetry = addHours(lastAttemptAt, baseIntervalHours);

  if (policy.salaryCycleAware) {
    nextRetry = adjustForNigerianSalaryCycle(nextRetry);
  }

  return nextRetry;
}
```

### Nigerian Salary Cycle Awareness

Nigerian salary cycles typically pay out between the 25th and 31st of the month. Payments processed between the 1st and 15th of the month are more likely to fail due to low account balances. The dunning engine avoids scheduling retries in this window and targets the late-month window instead.

```typescript
function adjustForNigerianSalaryCycle(proposedDate: Date): Date {
  const day = proposedDate.getDate();

  // If the proposed retry falls in the early-month dead zone (1st–15th),
  // push it to the 25th of the same month (salary credit window)
  if (day >= 1 && day <= 15) {
    return setDate(proposedDate, 25);
  }

  // If it falls between 16th–24th, push to the 25th
  if (day >= 16 && day <= 24) {
    return setDate(proposedDate, 25);
  }

  // 25th–31st is the ideal window — keep as-is
  return proposedDate;
}
```

This is a first-order approximation. Future versions could incorporate bank holiday awareness or machine-learned optimal retry windows from historical charge data.

### Backup Card Fallback

When a charge fails and the customer has multiple payment methods:

```typescript
export async function attemptDunningRetry(
  tenantId: string,
  subscriptionId: string
): Promise<DunningAttemptResult> {
  const subscription = await getSubscription(tenantId, subscriptionId);
  const invoice = await getUnpaidInvoice(tenantId, subscriptionId);
  
  const primaryMethod = await getDefaultPaymentMethod(tenantId, subscription.customerId);
  
  // Try primary method first
  let result = await attemptCharge(tenantId, invoice, primaryMethod);
  
  if (result.success) return result;
  
  // If primary fails and policy allows backup, try other cards
  if (policy.backupCardFallback) {
    const backupMethods = await getFallbackMethods(tenantId, subscription.customerId, primaryMethod.id);
    
    for (const method of backupMethods) {
      result = await attemptCharge(tenantId, invoice, method);
      if (result.success) {
        // Optionally update default to the card that worked
        return result;
      }
    }
  }
  
  return result; // All methods failed
}
```

### Self-Cure Detection

A customer is considered "self-cured" when they add a new payment method while their subscription is in `past_due` status. The payment method module emits a webhook event `payment_method.attached` which the dunning runner listens for:

```typescript
// When a new card is attached to a past_due subscription's customer,
// immediately trigger a dunning retry rather than waiting for the next cron run
export async function detectAndHandleSelfCure(
  tenantId: string,
  customerId: string
): Promise<void> {
  const pastDueSubs = await findPastDueByCustomer(tenantId, customerId);
  
  for (const sub of pastDueSubs) {
    logger.info({ event: 'dunning.self_cure_detected', subscriptionId: sub.id });
    // Trigger immediate retry — bypasses the scheduled retry window
    await attemptDunningRetry(tenantId, sub.id);
  }
}
```

---

## 9. Coupon Engine Design

### Coupon Validation

```typescript
export async function validateCoupon(
  tenantId: string,
  code: string,
  context: CouponContext
): Promise<CouponValidationResult> {
  const coupon = await findCouponByCode(sql, tenantId, code);

  if (!coupon) return { valid: false, reason: 'COUPON_NOT_FOUND' };
  if (!coupon.active) return { valid: false, reason: 'COUPON_INACTIVE' };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return { valid: false, reason: 'COUPON_EXPIRED' };
  if (coupon.maxRedemptions !== null && coupon.timesRedeemed >= coupon.maxRedemptions) {
    return { valid: false, reason: 'COUPON_USAGE_LIMIT_REACHED' };
  }
  if (coupon.appliesToPlanId && coupon.appliesToPlanId !== context.planId) {
    return { valid: false, reason: 'COUPON_NOT_APPLICABLE_TO_PLAN' };
  }

  return { valid: true, coupon };
}
```

### Discount Calculation

```typescript
export function applyDiscount(subtotal: number, coupon: Coupon): DiscountResult {
  let discountAmount: number;

  if (coupon.discountType === 'percentage') {
    discountAmount = Math.floor(subtotal * (coupon.discountValue / 100));
  } else if (coupon.discountType === 'fixed') {
    discountAmount = Math.min(coupon.discountValue, subtotal); // Cannot discount below zero
  } else {
    throw new Error(`Unknown discount type: ${coupon.discountType}`);
  }

  return {
    originalAmount: subtotal,
    discountAmount,
    finalAmount: subtotal - discountAmount,
    couponId: coupon.id,
  };
}
```

### Repeating Coupon Tracking

Coupons with `duration = 'repeating'` apply for a fixed number of billing cycles. The `subscription_coupons` join table tracks remaining cycles:

```sql
CREATE TABLE subscription_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  coupon_id UUID NOT NULL REFERENCES coupons(id),
  cycles_remaining INT,         -- NULL for 'forever', 0 = exhausted
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

After each successful billing cycle, `cycles_remaining` is decremented. When it reaches `0`, the coupon is no longer applied.

### Thread Safety for Usage Limits

The `times_redeemed` counter is incremented using an atomic SQL update with a constraint check:

```typescript
export async function incrementCouponUsage(sql: Sql, tenantId: string, couponId: string): Promise<void> {
  const [result] = await sql`
    UPDATE coupons
    SET times_redeemed = times_redeemed + 1
    WHERE tenant_id = ${tenantId}
      AND id = ${couponId}
      AND (max_redemptions IS NULL OR times_redeemed < max_redemptions)
    RETURNING id
  `;
  
  if (!result) {
    throw new DomainError('COUPON_USAGE_LIMIT_REACHED', 'Coupon has reached its maximum redemptions');
  }
}
```

The `WHERE` clause atomically checks the limit and the `UPDATE` in the same operation. If two concurrent requests try to redeem the last slot, PostgreSQL's row-level locking guarantees exactly one will succeed.

---

## 10. Metered Billing Design

### Reporting Usage

```http
POST /v1/usage
X-API-Key: rcv_live_...

{
  "subscriptionId": "sub_...",
  "quantity": 1500,
  "metric": "api_calls",
  "idempotencyKey": "usr_20240115_batch_3",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

Usage records are idempotent by `idempotency_key` — a second report with the same key is a no-op.

### Storage

```sql
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  metric VARCHAR(100) NOT NULL,
  quantity NUMERIC(20, 4) NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_billing_period ON usage_records (
  tenant_id, subscription_id, billing_period_start, billing_period_end
);
```

### Aggregation for Invoicing

```typescript
export async function aggregateUsage(
  sql: Sql,
  tenantId: string,
  subscriptionId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<UsageAggregation[]> {
  return sql<UsageAggregation[]>`
    SELECT
      metric,
      SUM(quantity) AS total_quantity,
      COUNT(*) AS record_count
    FROM usage_records
    WHERE tenant_id = ${tenantId}
      AND subscription_id = ${subscriptionId}
      AND billing_period_start >= ${periodStart}
      AND billing_period_end <= ${periodEnd}
    GROUP BY metric
  `;
}
```

### Edge Cases

**Usage reported after billing cutoff:** A usage record with a `timestamp` after `current_period_end` is stored with the next billing period's window. It will be billed in the next cycle. This is surfaced in the API response so tenants can make informed decisions.

**Zero usage in a cycle:** The invoice is built with a `0` quantity line item. The tenant's plan configuration determines whether a zero-usage invoice is charged or skipped.

**Usage on cancelled subscription:** The billing scheduler checks subscription status before billing. If a subscription is cancelled, outstanding usage is invoiced immediately as part of the final invoice (configurable per tenant).

---

## 11. Webhook System Design

### Inbound: Nomba Webhooks

**Endpoint:** `POST /inbound/nomba`

This endpoint is not authenticated by API key — it is authenticated by Nomba's HMAC signature.

#### Signature Verification

```typescript
// src/webhooks/inbound/verify.ts
import { createHmac, timingSafeEqual } from 'crypto';

export function verifyNombaSignature(
  payload: string,        // Raw request body as string (before JSON.parse)
  signature: string,      // Value of X-Nomba-Signature header
  secret: string          // Nomba webhook secret from tenant config
): boolean {
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  // timingSafeEqual prevents timing attacks
  const expectedBuffer = Buffer.from(`sha256=${expectedSignature}`, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) return false;
  
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
```

The raw body must be used for signature verification. The middleware reads the body as a string before any JSON parsing occurs.

#### Idempotency

Every Nomba webhook event has a unique `event_id`. The inbound handler checks this against a `processed_webhook_events` table before processing:

```typescript
// src/webhooks/inbound/handler.ts
export async function handleNombaWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();  // Must read as text for signature verification
  const signature = c.req.header('X-Nomba-Signature') ?? '';
  
  const tenant = c.get('tenant');
  
  if (!verifyNombaSignature(rawBody, signature, tenant.nombaWebhookSecret)) {
    logger.warn({ event: 'webhook.inbound.signature_invalid', tenantId: tenant.id });
    return c.json({ error: 'Invalid signature' }, 401);
  }
  
  const event = JSON.parse(rawBody);
  const eventId = event.id;
  
  // Idempotency check
  const alreadyProcessed = await checkWebhookIdempotency(sql, eventId);
  if (alreadyProcessed) {
    return c.json({ received: true, duplicate: true }, 200);
  }
  
  // Mark as received before processing (prevents duplicate if processor crashes)
  await markWebhookReceived(sql, eventId, tenant.id);
  
  // Route to processor — errors are caught and logged, not surfaced to Nomba
  try {
    await processNombaEvent(tenant.id, event);
  } catch (err) {
    logger.error({ event: 'webhook.inbound.process_error', eventId, error: err });
  }
  
  return c.json({ received: true }, 200);
}
```

#### Event Processing Pipeline

```typescript
// src/webhooks/inbound/processor.ts
export async function processNombaEvent(tenantId: string, event: NombaWebhookEvent): Promise<void> {
  switch (event.type) {
    case 'payment.successful':
      await handlePaymentSuccess(tenantId, event.data);
      break;
    case 'payment.failed':
      await handlePaymentFailed(tenantId, event.data);
      break;
    case 'refund.completed':
      await handleRefundCompleted(tenantId, event.data);
      break;
    default:
      logger.info({ event: 'webhook.inbound.unhandled_type', type: event.type });
  }
}
```

---

### Outbound: Tenant Webhook Delivery

#### Delivery Worker

```typescript
// src/webhooks/outbound/delivery.ts
export async function deliverWebhookEvent(delivery: WebhookDelivery): Promise<DeliveryResult> {
  const endpoint = await getWebhookEndpoint(sql, delivery.endpointId);
  const payload = JSON.stringify(delivery.payload);
  const signature = signPayload(endpoint.signingSecret, payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Recurva-Signature': `sha256=${signature}`,
        'X-Recurva-Event': delivery.eventType,
        'X-Recurva-Delivery': delivery.id,
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const success = res.status >= 200 && res.status < 300;
    
    await recordDeliveryAttempt(sql, delivery.id, {
      success,
      httpStatus: res.status,
      responseBody: await res.text().catch(() => null),
      attemptedAt: new Date(),
    });

    return { success, httpStatus: res.status };
  } catch (err) {
    clearTimeout(timeout);
    await recordDeliveryAttempt(sql, delivery.id, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      attemptedAt: new Date(),
    });
    return { success: false, error: err };
  }
}
```

#### Retry Backoff Strategy

Failed deliveries are retried with exponential backoff:

| Attempt | Delay After Previous |
|---------|----------------------|
| 1st retry | 1 minute |
| 2nd retry | 5 minutes |
| 3rd retry | 30 minutes |
| 4th retry | 2 hours |
| 5th retry | 8 hours |

After 5 failed attempts, the delivery is marked as permanently failed and a `webhook.delivery.failed` event is surfaced in the tenant dashboard.

```typescript
const RETRY_DELAYS_MS = [
  1 * 60 * 1000,      // 1 min
  5 * 60 * 1000,      // 5 min
  30 * 60 * 1000,     // 30 min
  2 * 60 * 60 * 1000, // 2 hr
  8 * 60 * 60 * 1000, // 8 hr
];

export function calculateNextRetryAt(attemptCount: number): Date | null {
  const delay = RETRY_DELAYS_MS[attemptCount];
  if (!delay) return null; // Max retries exceeded
  return new Date(Date.now() + delay);
}
```

#### Outbound Signature Verification (Tenant Side)

Tenants verify Recurva's outbound webhooks using HMAC-SHA256, the same algorithm Nomba uses:

```typescript
// Example tenant verification code (for tenant documentation)
function verifyRecurvaSignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  return timingSafeEqual(
    Buffer.from(`sha256=${expected}`),
    Buffer.from(signature)
  );
}
```

---

## 12. API Layer Design

### Hono App Factory

The app is created by a factory function rather than a top-level singleton. This enables:
- Easy test instantiation (create a fresh app per test)
- Dependency injection (pass DB, Nomba client into app)
- Future sub-app composition (portal app, dashboard app)

```typescript
// src/api/app.ts
import { Hono } from 'hono';
import { requestId } from './middleware/request-id';
import { structuredLogger } from './middleware/logger';
import { tenantAuth } from './middleware/tenant-auth';
import { errorHandler } from './middleware/error-handler';

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();

  // ── Middleware Stack ────────────────────────────────────────────────────────
  app.use('*', requestId());          // 1. Request ID
  app.use('*', structuredLogger());   // 2. Logger
  app.use('/v1/*', tenantAuth(deps)); // 3. Tenant auth (skip public routes)

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.route('/v1/plans',         planRoutes(deps));
  app.route('/v1/customers',     customerRoutes(deps));
  app.route('/v1/subscriptions', subscriptionRoutes(deps));
  app.route('/v1/invoices',      invoiceRoutes(deps));
  app.route('/v1/usage',         usageRoutes(deps));
  app.route('/v1/coupons',       couponRoutes(deps));
  app.route('/v1/webhooks',      webhookRoutes(deps));

  // ── Error Handler ──────────────────────────────────────────────────────────
  app.onError(errorHandler);  // 6. Catches everything above

  return app;
}
```

### Middleware Stack (Exact Order with Rationale)

**1. Request ID Injection**
Every request gets a unique `request_id` (UUID v4) injected into the context before any other processing. This ensures all subsequent logs, errors, and audit entries for this request share the same ID, enabling end-to-end tracing.

**2. Structured Logging**
Logs the incoming request (method, path, request_id) immediately. Then wraps `next()` to log the response (status, duration_ms) after the handler completes. Must come after request ID (needs the ID) and before auth (needs to log auth failures too).

**3. Tenant Authentication**
Validates the `X-API-Key` header, loads the tenant from DB, decrypts Nomba credentials, and stores them in request context. Rejects unauthenticated requests with `401`. Must come before route handlers (they need tenant context) but after logger (auth failures should be logged).

**4. Zod Request Validation**
Applied per-route (not globally), as a route-level middleware. Validates the request body against the route's Zod schema. Returns `400` with structured field errors on validation failure. Applied after auth to avoid spending CPU validating unauthenticated requests.

**5. Route Handler**
The actual business logic call. By this point, `c.get('tenant')` is populated, the request body is validated, and `request_id` is available for logging.

**6. Error Handler**
`app.onError()` catches all uncaught errors from any middleware or route handler above. Maps domain errors to appropriate HTTP status codes. Ensures no raw error details leak to the response body.

### Zod Validation Error Mapping

```typescript
// src/api/middleware/error-handler.ts
import { ZodError } from 'zod';
import { DomainError } from '../../errors';

export const errorHandler = (err: Error, c: Context): Response => {
  if (err instanceof ZodError) {
    return c.json({
      error: {
        type: 'validation_error',
        message: 'Request validation failed',
        fields: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      },
    }, 400);
  }

  if (err instanceof DomainError) {
    return c.json({
      error: {
        type: err.code,
        message: err.message,
      },
    }, err.httpStatus);
  }

  // Unknown error — log fully, return generic message
  logger.error({
    event: 'api.unhandled_error',
    request_id: c.get('requestId'),
    error: err,
  });

  return c.json({
    error: {
      type: 'internal_error',
      message: 'An unexpected error occurred',
    },
  }, 500);
};
```

### API Versioning

All routes are prefixed with `/v1/`. This is not aspirational — it is a discipline. The versioning prefix:

- Allows introducing `/v2/` routes without removing `/v1/` routes, giving tenants migration time
- Makes breaking changes impossible to deploy silently
- Is cheap to do from day one and expensive to retrofit later

### Tenant Context Flow

The tenant context flows through the request lifecycle via Hono's context variables:

```typescript
// Set in tenant-auth middleware:
c.set('requestId', uuid());
c.set('tenant', tenant);
c.set('nombaClient', createNombaClient(credentials));

// Available in any route handler:
const tenant = c.get('tenant');
const nombaClient = c.get('nombaClient');
```

---

## 13. Security Implementation

### API Key Format

```
rcv_live_<32 random bytes as hex>   // Live environment
rk_test_<32 random bytes as hex>   // Test environment
```

Generated on tenant creation:

```typescript
import { randomBytes } from 'crypto';

export function generateApiKey(environment: 'live' | 'test'): { raw: string; hash: string } {
  const secret = randomBytes(32).toString('hex');
  const raw = `rk_${environment}_${secret}`;
  const hash = bcrypt.hashSync(raw, 12);
  return { raw, hash };
}
```

Only `hash` is stored. The `raw` key is shown to the tenant once on creation and never stored. If lost, the key must be rotated.

### Hashing: bcrypt with Work Factor 12

bcrypt at work factor 12 is chosen because:
- API key validation happens at most once per request (keys are typically cached in the auth middleware with a short TTL — but even without caching, bcrypt at 12 takes ~250ms, which is acceptable for key validation)
- Work factor 12 requires ~250ms on modern hardware, making brute-force infeasible
- bcrypt has a 72-character input limit, which is sufficient for our key format
- Argon2 would be superior for password hashing, but bcrypt is well-understood, widely audited, and available in Node.js native crypto

### Webhook Signing: HMAC-SHA256

```typescript
// src/webhooks/outbound/signer.ts
import { createHmac } from 'crypto';

export function signPayload(secret: string, payload: string): string {
  return createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}

// Usage — the header value is: sha256=<hex_digest>
const signature = `sha256=${signPayload(endpoint.signingSecret, JSON.stringify(payload))}`;
```

Tenants verify using `timingSafeEqual` to prevent timing attacks (documented in their integration guide).

### Customer Portal: JWT

```typescript
// src/domain/portal/portal.service.ts
import { sign, verify } from 'hono/jwt';

const JWT_EXPIRY = 60 * 60 * 24; // 24 hours

export async function issuePortalSession(tenantId: string, customerId: string): Promise<string> {
  return sign({
    sub: customerId,
    tenant_id: tenantId,
    scope: 'portal',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY,
  }, process.env.PORTAL_JWT_SECRET!);
}

export async function verifyPortalToken(token: string): Promise<PortalClaims> {
  const claims = await verify(token, process.env.PORTAL_JWT_SECRET!);
  if (claims.scope !== 'portal') throw new Error('Invalid token scope');
  return claims as PortalClaims;
}
```

Portal routes are on a separate sub-app that only accepts JWT auth — API keys are rejected on portal routes.

### Environment Variables

**Lives in `.env`:**
```
DATABASE_URL=postgres://...
PORTAL_JWT_SECRET=...                # 256-bit random secret for JWT signing
NOMBA_WEBHOOK_SECRET_KEY=...         # Used to decrypt per-tenant secrets
```

**Must NEVER be in `.env` or committed:**
- Per-tenant Nomba credentials (stored encrypted in DB)
- Customer payment tokens (stored in Nomba — never in our DB)
- Production secrets in development `.env` files

### SQL Safety

```typescript
// CORRECT — parameterized via tagged template literal
const result = await sql`
  SELECT * FROM subscriptions
  WHERE tenant_id = ${tenantId}
  AND status = ${status}
`;

// WRONG — string interpolation = SQL injection
const result = await sql.unsafe(
  `SELECT * FROM subscriptions WHERE tenant_id = '${tenantId}'`
);
// Note: sql.unsafe() is used ONLY for migration DDL statements
// where parameterized queries are not syntactically valid
```

The rule is: `sql.unsafe()` is only used in `src/db/migrate.ts` for DDL statements. Anywhere else in the codebase, `sql.unsafe()` is a bug.

---

## 14. Deployment Architecture

### Docker Compose

```yaml
# docker-compose.yml
version: '3.9'

services:
  app:
    build:
      context: .
      dockerfile: docker/app.Dockerfile
    restart: always
    environment:
      DATABASE_URL: postgres://recurva:${POSTGRES_PASSWORD}@postgres:5432/recurva
      NODE_ENV: production
      PORT: 3000
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - internal
    # No external port — nginx is the only entry point

  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: recurva
      POSTGRES_USER: recurva
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres-init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U recurva"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - internal
    # No external port — only accessible within Docker network

  nginx:
    image: nginx:1.25-alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - certbot_www:/var/www/certbot:ro
    depends_on:
      - app
    networks:
      - internal

volumes:
  postgres_data:
  certbot_www:

networks:
  internal:
    driver: bridge
```

### App Dockerfile

```dockerfile
# docker/app.Dockerfile

# Stage 1: Dependencies
FROM oven/bun:1.1-alpine AS deps
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Stage 2: Runtime
FROM oven/bun:1.1-alpine AS runtime
WORKDIR /app

# Copy only what's needed
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY migrations ./migrations
COPY tsconfig.json ./
COPY package.json ./

# Non-root user for security
RUN addgroup -S recurva && adduser -S recurva -G recurva
USER recurva

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "run", "src/index.ts"]
```

### Nginx Configuration

```nginx
# docker/nginx.conf

events {
  worker_connections 1024;
}

http {
  # Hide nginx version
  server_tokens off;

  # Security headers applied globally
  add_header X-Frame-Options DENY always;
  add_header X-Content-Type-Options nosniff always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Content-Security-Policy "default-src 'none'" always;
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

  # Rate limiting — 100 requests per second per IP
  limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;

  # HTTP — redirect to HTTPS and handle Certbot challenges
  server {
    listen 80;
    server_name api.recurva.io;

    # Certbot ACME challenge
    location /.well-known/acme-challenge/ {
      root /var/www/certbot;
    }

    # Everything else → HTTPS
    location / {
      return 301 https://$host$request_uri;
    }
  }

  # HTTPS — main server block
  server {
    listen 443 ssl http2;
    server_name api.recurva.io;

    ssl_certificate /etc/letsencrypt/live/api.recurva.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.recurva.io/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP stapling
    ssl_stapling on;
    ssl_stapling_verify on;

    # Proxy to Bun app
    location / {
      limit_req zone=api burst=50 nodelay;

      proxy_pass http://app:3000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_cache_bypass $http_upgrade;

      proxy_connect_timeout 5s;
      proxy_send_timeout 30s;
      proxy_read_timeout 30s;

      # Body size limit — 1MB is sufficient for all our API payloads
      client_max_body_size 1m;
    }
  }
}
```

### Cloudflare Setup

**Required DNS Records:**

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | api | `<Oracle VPS IP>` | Proxied (orange cloud) |
| A | @ | `<Oracle VPS IP>` | Proxied |

**Proxy mode (orange cloud) is required** for DDoS protection. Cloudflare terminates the connection and forwards to the VPS through their network. The VPS never sees real client IPs directly — Nginx reads the IP from `X-Forwarded-For` (set by Cloudflare).

**Cloudflare SSL Mode:** Set to `Full (strict)` — Cloudflare verifies the origin certificate (Let's Encrypt) between Cloudflare and the VPS. This requires a valid SSL certificate on the VPS.

### Certbot

**Initial certificate acquisition:**
```bash
# Stop nginx temporarily to free port 80 for standalone verification
docker compose stop nginx

# Obtain certificate
certbot certonly \
  --standalone \
  --preferred-challenges http \
  -d api.recurva.io \
  --email ops@recurva.io \
  --agree-tos \
  --no-eff-email

# Restart nginx
docker compose start nginx
```

**Auto-renewal (cron on VPS):**
```bash
# Add to root crontab: crontab -e
0 3 * * * certbot renew --quiet --deploy-hook "docker compose -f /opt/recurva/docker-compose.yml exec nginx nginx -s reload"
```

---

## 15. CI/CD Pipeline

### Pull Request Checks (`.github/workflows/pr.yml`)

```yaml
name: PR Checks

on:
  pull_request:
    branches: [dev, staging, main]

jobs:
  checks:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: recurva_test
          POSTGRES_USER: recurva
          POSTGRES_PASSWORD: test_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Type check
        run: bun run tsc --noEmit

      - name: Lint
        run: bun run lint

      - name: Run unit tests
        run: bun test tests/unit/

      - name: Run integration tests
        env:
          DATABASE_URL: postgres://recurva:test_password@localhost:5432/recurva_test
          NODE_ENV: test
        run: bun test tests/integration/
```

### Staging Deploy (`.github/workflows/staging.yml`)

```yaml
name: Deploy to Staging

on:
  push:
    branches: [staging]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Run all checks
        # Re-run all PR checks to ensure staging deploy is always green
        run: |
          bun install --frozen-lockfile
          bun run tsc --noEmit
          bun run lint
          bun test tests/unit/

      - name: Build Docker image
        run: |
          docker build -f docker/app.Dockerfile -t recurva-app:${{ github.sha }} .

      - name: Deploy to staging VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_VPS_HOST }}
          username: deploy
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/recurva-staging
            git pull origin staging
            docker compose pull
            docker compose up -d --build app
            docker compose exec app bun run src/db/migrate.ts
            echo "Staging deploy complete"

      - name: Run smoke tests against staging
        env:
          STAGING_API_KEY: ${{ secrets.STAGING_SMOKE_API_KEY }}
          STAGING_URL: ${{ secrets.STAGING_URL }}
        run: bun test tests/smoke/

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text": "Staging deploy failed: ${{ github.sha }}"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Production Deploy (`.github/workflows/production.yml`)

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval in GitHub Environments

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install and verify
        run: |
          bun install --frozen-lockfile
          bun run tsc --noEmit
          bun run lint
          bun test tests/unit/

      - name: Deploy to production VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PRODUCTION_VPS_HOST }}
          username: deploy
          key: ${{ secrets.PRODUCTION_SSH_KEY }}
          script: |
            cd /opt/recurva
            git pull origin main
            
            # Zero-downtime: build new image before stopping old container
            docker compose build app
            
            # Run migrations before switching traffic
            docker compose run --rm app bun run src/db/migrate.ts
            
            # Restart app (nginx keeps accepting — Hono drains gracefully)
            docker compose up -d --no-deps app
            
            # Wait for health check to pass
            sleep 10
            curl -f http://localhost:3000/health || exit 1
            
            echo "Production deploy complete: ${{ github.sha }}"

      - name: Run production smoke tests
        env:
          PROD_API_KEY: ${{ secrets.PROD_SMOKE_API_KEY }}
          PROD_URL: https://api.recurva.io
        run: bun test tests/smoke/

      - name: Notify on success
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text": "Production deploy succeeded: ${{ github.sha }}"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text": "🚨 PRODUCTION DEPLOY FAILED: ${{ github.sha }} — immediate rollback required"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Secrets Management

All secrets live in GitHub Environments (Settings → Environments → staging / production). Environment-level secrets require environment protection rules:

- **Staging:** Auto-approved for pushes from `staging` branch
- **Production:** Requires manual approval from a designated reviewer

Secrets used:
```
STAGING_VPS_HOST       / PRODUCTION_VPS_HOST       — VPS IP or hostname
STAGING_SSH_KEY        / PRODUCTION_SSH_KEY         — Deploy private key (Ed25519)
STAGING_SMOKE_API_KEY  / PROD_SMOKE_API_KEY         — Read-only key for smoke tests
STAGING_URL            / (hardcoded for prod)
SLACK_WEBHOOK                                        — Failure notifications
```

Secrets are **never** echoed in logs. GitHub Actions masks them automatically.

---

## 16. Observability Design

### Structured JSON Log Format

Every log line is a single JSON object. No multi-line logs. No unstructured strings.

```typescript
// src/logger.ts
export interface LogEntry {
  timestamp: string;       // ISO 8601: "2024-01-15T14:30:00.123Z"
  level: 'debug' | 'info' | 'warn' | 'error';
  request_id?: string;     // Present on all logs within a request
  tenant_id?: string;      // Present on all tenant-scoped operations
  event: string;           // Dotted namespace: "billing.charge.attempt"
  duration_ms?: number;    // Present on timed operations
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  [key: string]: unknown;  // Additional context fields
}

export const logger = {
  info: (entry: Omit<LogEntry, 'timestamp' | 'level'>) =>
    console.log(JSON.stringify({ ...entry, timestamp: new Date().toISOString(), level: 'info' })),
  warn: (entry: Omit<LogEntry, 'timestamp' | 'level'>) =>
    console.warn(JSON.stringify({ ...entry, timestamp: new Date().toISOString(), level: 'warn' })),
  error: (entry: Omit<LogEntry, 'timestamp' | 'level'>) =>
    console.error(JSON.stringify({ ...entry, timestamp: new Date().toISOString(), level: 'error' })),
  debug: (entry: Omit<LogEntry, 'timestamp' | 'level'>) =>
    console.debug(JSON.stringify({ ...entry, timestamp: new Date().toISOString(), level: 'debug' })),
};
```

### What Is Logged at Each Layer

**API Layer:**
- `api.request` — method, path, request_id (at request start)
- `api.response` — status, duration_ms (at request end)
- `api.auth.failed` — invalid API key attempts (warn)
- `api.validation.failed` — Zod errors (warn)

**Domain Layer:**
- `billing.invoice.created` — invoice_id, amount, currency
- `billing.charge.attempt` — invoice_id, payment_method_id, amount
- `billing.charge.success` — invoice_id, nomba_charge_id
- `billing.charge.failed` — invoice_id, error_code, retryable
- `subscription.transition` — from_state, to_state, event, subscription_id
- `dunning.attempt` — attempt_number, next_retry_at, subscription_id
- `dunning.exhausted` — subscription_id, total_attempts

**Infrastructure Layer:**
- `db.query.slow` — queries exceeding 500ms (warn)
- `nomba.request` — method, path, duration_ms
- `nomba.response` — status, nomba_reference
- `webhook.outbound.attempt` — delivery_id, endpoint_url, attempt_number
- `webhook.outbound.success` — delivery_id, http_status
- `webhook.outbound.failed` — delivery_id, error, will_retry

**Scheduler:**
- `scheduler.billing.started` — run_id, found_subscriptions_count
- `scheduler.billing.cycle_complete` — processed, errors, duration_ms
- `scheduler.billing.job_failed` — subscription_id, error (written to dead letter)

---

### Audit Log

The `subscription_audit_log` table records every billing event permanently. This is separate from application logs (which are ephemeral).

```sql
CREATE TABLE subscription_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entity_type VARCHAR(50) NOT NULL,     -- 'subscription', 'invoice', 'charge'
  entity_id UUID NOT NULL,
  event VARCHAR(100) NOT NULL,          -- 'subscription.PAYMENT_FAILED'
  from_state VARCHAR(50),               -- State before transition
  to_state VARCHAR(50),                 -- State after transition
  actor_type VARCHAR(50) NOT NULL,      -- 'scheduler', 'api', 'webhook'
  actor_id VARCHAR(255),                -- request_id or scheduler run_id
  metadata JSONB,                       -- Event-specific data
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON subscription_audit_log (tenant_id, entity_id, occurred_at DESC);
```

---

### Tracing a Failed Charge End-to-End

Given a subscription ID and a time range, a failed charge can be fully reconstructed from logs:

```bash
# 1. Find all log lines for this subscription in the billing window
grep '"subscription_id":"sub_abc123"' /var/log/recurva/app.log | jq .

# 2. Expected sequence for a failed billing run:
# {"event":"billing.charge.attempt","subscription_id":"sub_abc123","invoice_id":"inv_xyz","amount":5000}
# {"event":"nomba.request","path":"/charges","method":"POST"}
# {"event":"nomba.response","status":200,"nomba_code":"INSUFFICIENT_FUNDS"}
# {"event":"billing.charge.failed","invoice_id":"inv_xyz","error_code":"INSUFFICIENT_FUNDS","retryable":true}
# {"event":"subscription.transition","from_state":"active","to_state":"past_due","event":"PAYMENT_FAILED"}
# {"event":"dunning.attempt","subscription_id":"sub_abc123","attempt_number":1,"next_retry_at":"2024-01-25T00:00:00Z"}
# {"event":"webhook.outbound.attempt","event_type":"subscription.past_due","delivery_id":"wdel_..."}

# 3. If webhook delivery failed, find the delivery record:
grep '"delivery_id":"wdel_abc"' /var/log/recurva/app.log | jq .

# 4. Cross-reference with audit log in DB:
# SELECT * FROM subscription_audit_log
# WHERE entity_id = 'sub_abc123'
# ORDER BY occurred_at;
```

---

## 17. Technical Decisions Log

| Decision | Options Considered | Choice | Reason |
|---|---|---|---|
| **Runtime** | Node.js 20, Deno, Bun | **Bun** | Native cron scheduling (`Bun.cron`), faster cold starts, native test runner, TypeScript-first without compilation step. Adequate ecosystem maturity for production use as of 2024. |
| **Framework** | Express, Fastify, Hono | **Hono** | First-class TypeScript, typed request context, lightweight, excellent middleware composition, runs natively on Bun. Fastify requires adapter. Express has no typed context. |
| **Database** | PostgreSQL, MySQL, MongoDB, PlanetScale | **PostgreSQL** | Advisory locks (critical for billing scheduler), `FOR UPDATE SKIP LOCKED` (concurrent job processing), JSONB for policy/metadata, ACID transactions across all billing operations, mature ecosystem. MongoDB's eventual consistency is incompatible with financial data requirements. |
| **Query layer** | Drizzle, Prisma, Kysely, raw SQL | **Raw SQL (postgres.js)** | Full control over query shape. Advisory locks, window functions, and `FOR UPDATE SKIP LOCKED` are either unsupported or awkward in ORMs. Tagged template literals in postgres.js are injection-safe by default. No schema-drift risk from ORM magic migrations. |
| **Architecture** | Microservices, Monolith, Modular Monolith | **Modular Monolith** | Microservices add distributed transaction complexity and operational overhead with no benefit at current scale. Strong internal module boundaries enforce the same isolation as microservices. Easy extraction path when scale requires it. |
| **API key auth strategy** | JWT, bcrypt-hashed static key, database lookup + bcrypt | **bcrypt-hashed static key** | JWTs for machine-to-machine auth add expiry complexity with no benefit (we control key rotation). Static key + bcrypt is simple, auditable, and revocable. Work factor 12 makes brute-force infeasible. |
| **Customer portal auth** | API key (shared with tenant), session cookies, JWT | **JWT (24hr expiry)** | Portal sessions must be scoped to a single customer, not the full tenant. Stateless JWT avoids a session store. 24hr expiry balances security and UX for portal use cases. |
| **Webhook delivery** | Inline (synchronous), message queue (Redis/BullMQ), database outbox | **Database outbox pattern** | No additional infrastructure (no Redis). Delivery is guaranteed by the same transaction that records the event. Worker polls the DB delivery table. Sufficient throughput for current scale. |
| **Dunning retry strategy** | Fixed interval, exponential backoff, salary-cycle-aware | **Salary-cycle-aware with exponential backoff** | Nigerian salary cycles make early-month retries statistically wasteful. Targeting the 25th–31st window improves recovery rates. Falls back to standard exponential backoff for tenants who disable salary-cycle awareness. |
| **Multi-currency exchange rates** | Live rates (Central Bank API), daily snapshot, fixed at subscription creation | **Daily snapshot** | Live rates introduce non-determinism into invoice amounts — the same subscription could produce different invoice totals on retry. Daily snapshots are stored at subscription creation and used for all charges in that cycle. Customers see predictable amounts. |
| **Job scheduler** | Redis + BullMQ, Temporal, pg-boss, Bun.cron + advisory locks | **Bun.cron + PostgreSQL advisory locks** | No additional infrastructure. Bun.cron provides native cron syntax. Advisory locks in PostgreSQL handle the distributed locking problem correctly. pg-boss was considered but adds another abstraction layer over the same primitives. |

---

*End of Architecture Document*

> **Maintainers:** Update this document whenever an architectural decision changes. A decision that is not documented here should be treated as a decision that was not made.
