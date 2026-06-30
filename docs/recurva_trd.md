# Recurva — Technical Requirements Document

> **Version:** 1.0.0  
> **Stack:** Bun · Hono · PostgreSQL (postgres.js) · Zod · Bun Test  
> **Payment Rail:** Nomba APIs  
> **Audience:** Senior fintech engineers. Every decision is documented with rationale.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Database Schema](#2-database-schema)
3. [Subscription State Machine](#3-subscription-state-machine)
4. [Nomba Integration Specification](#4-nomba-integration-specification)
5. [Billing Engine Specification](#5-billing-engine-specification)
6. [Dunning Engine Specification](#6-dunning-engine-specification)
7. [Coupon Engine Specification](#7-coupon-engine-specification)
8. [Multiple Payment Methods Specification](#8-multiple-payment-methods-specification)
9. [Webhook System Specification](#9-webhook-system-specification)
10. [API Specification](#10-api-specification)
11. [Security Specification](#11-security-specification)
12. [Error Handling Standard](#12-error-handling-standard)
13. [Testing Specification](#13-testing-specification)

---

## 1. System Overview

### 1.1 Position in the Stack

Recurva is a **multi-tenant subscription billing engine** that sits between Nomba (payment processor) and downstream tenant applications. It owns the entire subscription lifecycle — trial management, recurring billing, dunning, proration, coupon application — so tenant developers integrate a single Recurva API instead of building billing logic themselves.

```
Tenant App ──REST──► Recurva API Layer
                           │
                    Domain Layer (billing engine,
                           │      dunning, state machine)
                           │
                    Infrastructure Layer
                     (PostgreSQL, job queues,
                           │      outbound webhooks)
                           │
                     Nomba Payment APIs
                           │
                     Nomba Webhooks ──► Recurva Inbound Handler
```

### 1.2 Three-Layer Architecture

**API Layer** (Hono routes in `src/api/`)
- Authenticates requests (tenant API key or customer JWT)
- Validates input with Zod schemas
- Delegates to Domain layer
- Returns uniform JSON responses
- Rate-limiting enforced here

**Domain Layer** (`src/domain/`)
- Pure business logic with no HTTP or DB concerns
- Modules: `billing`, `dunning`, `coupon`, `proration`, `stateMachine`, `webhookDispatch`
- All domain functions receive typed inputs and return typed results
- Side effects (DB writes, Nomba calls) are performed by callers or injected ports

**Infrastructure Layer** (`src/infra/`)
- `db/` — postgres.js connection pool and query helpers
- `nomba/` — typed Nomba API client with retry logic
- `queue/` — scheduled job runner (Bun's built-in cron or pg-boss)
- `mailer/` — email hook dispatcher (calls tenant webhook, does not send email directly)
- `outbound/` — outbound webhook delivery with retry

### 1.3 Full Data Flow

#### Flow A — New Subscription (Checkout)

```
Tenant App                Recurva                    Nomba
    │                        │                         │
    │─── POST /subscriptions ►│                         │
    │                        │ validate plan+customer   │
    │                        │ create subscription      │
    │                        │  (state=trialing/active) │
    │                        │─── POST /checkout ──────►│
    │                        │◄── {checkout_url} ───────│
    │◄── {checkout_url} ─────│                         │
    │                        │                         │
   [Customer completes checkout on Nomba hosted page]
    │                        │                         │
    │                        │◄── webhook: charge.success
    │                        │                         │
    │                        │ verify signature         │
    │                        │ mark invoice paid        │
    │                        │ store payment_method     │
    │                        │ set subscription=active  │
    │◄── webhook: subscription.activated
    │                        │
```

#### Flow B — Recurring Charge (Scheduler)

```
Recurva Scheduler           Recurva Domain            Nomba
    │                            │                      │
    │ cron: check due invoices   │                      │
    │──────────────────────────► │                      │
    │                            │ generate invoice      │
    │                            │ apply coupon          │
    │                            │ calculate proration   │
    │                            │──── POST /charge ───► │
    │                            │◄─── {status: success} │
    │                            │ mark invoice paid      │
    │                            │ advance billing period │
    │──────────────────────────► │ emit subscription.renewed
    │                            │──── tenant webhook ──► Tenant App
```

#### Flow C — Charge Failure → Dunning

```
Nomba                    Recurva                     Tenant App
  │                         │                             │
  │── webhook: charge.failed►│                             │
  │                         │ set subscription=past_due   │
  │                         │ create dunning_attempt      │
  │                         │─── webhook: payment_failed ►│
  │                         │                             │
  [Day 0: try backup card]
  │◄── POST /charge ─────── │                             │
  │─── charge.failed ──────►│                             │
  │                         │ schedule Day 1 retry        │
  ...
  [Day 10: no recovery]
  │                         │ set subscription=cancelled  │
  │                         │─── webhook: subscription.cancelled ►│
```

---

## 2. Database Schema

> **Rationale for raw SQL:** postgres.js with parameterised queries gives full control over indexes, partial indexes, and advisory locks — essential for a billing engine where correctness guarantees matter more than ORM convenience.

```sql
-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram index on coupon codes

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    email               TEXT NOT NULL UNIQUE,
    -- Nomba merchant account linked to this tenant
    nomba_account_id    TEXT NOT NULL,
    -- Outbound webhook signing secret (HMAC-SHA256 key)
    webhook_secret      TEXT NOT NULL,
    -- Soft delete: tenant is deactivated, not removed, to preserve audit trail
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TENANT API KEYS
-- ============================================================
-- Multiple keys per tenant (dev vs prod, rotation without downtime)
CREATE TABLE tenant_api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- Key prefix shown in dashboard for identification (e.g. "rk_live_abc12")
    key_prefix      TEXT NOT NULL,
    -- SHA-256 hash of the full key. Raw key is never stored.
    key_hash        TEXT NOT NULL UNIQUE,
    label           TEXT,                    -- Human label: "Production key"
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,             -- NULL = never expires
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_tenant ON tenant_api_keys(tenant_id);
-- Lookup by hash on every API request — must be fast
CREATE INDEX idx_api_keys_hash ON tenant_api_keys(key_hash) WHERE is_active = TRUE;

-- ============================================================
-- PLANS
-- ============================================================
CREATE TABLE plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    -- 'fixed' | 'metered' | 'mixed' (fixed base + metered overage)
    billing_type    TEXT NOT NULL CHECK (billing_type IN ('fixed', 'metered', 'mixed')),
    -- Billing interval
    interval        TEXT NOT NULL CHECK (interval IN ('day', 'week', 'month', 'year')),
    interval_count  INT NOT NULL DEFAULT 1 CHECK (interval_count > 0),
    -- Trial in days; NULL = no trial
    trial_days      INT CHECK (trial_days >= 0),
    -- Soft delete: archived plans block new subscriptions but keep existing ones intact
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plans_tenant ON plans(tenant_id) WHERE is_active = TRUE;

-- ============================================================
-- PLAN CURRENCIES
-- Each plan can be priced in multiple currencies.
-- The currency is locked to the subscription at creation time.
-- ============================================================
CREATE TABLE plan_currencies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    -- ISO 4217 currency code
    currency    TEXT NOT NULL CHECK (currency IN ('NGN', 'USD', 'GBP', 'EUR')),
    -- Amount in smallest currency unit (kobo for NGN, cents for USD/GBP/EUR)
    amount      BIGINT NOT NULL CHECK (amount >= 0),
    -- For metered plans: price per unit consumed
    unit_amount BIGINT CHECK (unit_amount >= 0),
    UNIQUE (plan_id, currency)
);

CREATE INDEX idx_plan_currencies_plan ON plan_currencies(plan_id);

-- ============================================================
-- COUPONS
-- ============================================================
CREATE TABLE coupons (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code                TEXT NOT NULL,
    -- 'percentage' | 'fixed_amount'
    discount_type       TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
    -- For percentage: value is 0-100 (stored as integer, e.g. 20 = 20%)
    -- For fixed_amount: value is in smallest currency unit
    discount_value      BIGINT NOT NULL CHECK (discount_value > 0),
    -- Required when discount_type = 'fixed_amount'; NULL for percentage
    currency            TEXT CHECK (currency IN ('NGN', 'USD', 'GBP', 'EUR')),
    -- 'once' | 'repeating' | 'forever'
    duration            TEXT NOT NULL CHECK (duration IN ('once', 'repeating', 'forever')),
    -- Required when duration = 'repeating'
    duration_months     INT CHECK (duration_months > 0),
    -- NULL = unlimited
    max_redemptions     INT CHECK (max_redemptions > 0),
    redemption_count    INT NOT NULL DEFAULT 0,
    expires_at          TIMESTAMPTZ,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

-- Trigram index for fast case-insensitive coupon code lookup
CREATE INDEX idx_coupons_code_trgm ON coupons USING GIN (code gin_trgm_ops);
CREATE INDEX idx_coupons_tenant ON coupons(tenant_id) WHERE is_active = TRUE;

-- ============================================================
-- COUPON REDEMPTIONS
-- Tracks every time a coupon is attached to a subscription.
-- ============================================================
CREATE TABLE coupon_redemptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id           UUID NOT NULL REFERENCES coupons(id),
    subscription_id     UUID NOT NULL,   -- FK added after subscriptions table
    -- Months of discount applied so far (used for 'repeating' duration tracking)
    months_applied      INT NOT NULL DEFAULT 0,
    redeemed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (coupon_id, subscription_id)
);

-- ============================================================
-- CUSTOMERS
-- A customer belongs to one tenant.
-- ============================================================
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- Tenant's own identifier for this customer (e.g. their user ID)
    external_id     TEXT,
    email           TEXT NOT NULL,
    name            TEXT,
    -- Default currency for this customer; overridable per subscription
    currency        TEXT NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN', 'USD', 'GBP', 'EUR')),
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email),
    UNIQUE (tenant_id, external_id)
);

CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_external ON customers(tenant_id, external_id);

-- ============================================================
-- PAYMENT METHODS
-- Multiple cards per customer. One primary, one optional backup.
-- Card numbers and CVV are NEVER stored — only Nomba's token.
-- ============================================================
CREATE TABLE payment_methods (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- Token returned by Nomba after successful checkout (used for recurring charges)
    nomba_token         TEXT NOT NULL,
    -- Display info only — never use for charging
    card_last4          TEXT NOT NULL CHECK (card_last4 ~ '^\d{4}$'),
    card_brand          TEXT NOT NULL,   -- 'visa', 'mastercard', 'verve', etc.
    card_exp_month      INT NOT NULL CHECK (card_exp_month BETWEEN 1 AND 12),
    card_exp_year       INT NOT NULL CHECK (card_exp_year >= 2020),
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    is_backup           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one primary and one backup per customer enforced at application level
-- (partial unique indexes handle the boolean flag pattern)
CREATE UNIQUE INDEX idx_pm_primary ON payment_methods(customer_id)
    WHERE is_primary = TRUE;
CREATE UNIQUE INDEX idx_pm_backup ON payment_methods(customer_id)
    WHERE is_backup = TRUE;
CREATE INDEX idx_pm_customer ON payment_methods(customer_id);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    customer_id             UUID NOT NULL REFERENCES customers(id),
    plan_id                 UUID NOT NULL REFERENCES plans(id),
    -- Currency locked at creation — billing always in this currency
    currency                TEXT NOT NULL CHECK (currency IN ('NGN', 'USD', 'GBP', 'EUR')),
    -- State machine states
    status                  TEXT NOT NULL CHECK (status IN (
                                'trialing', 'active', 'past_due', 'paused',
                                'cancelled', 'ended', 'unpaid'
                            )),
    -- Active payment method for this subscription
    payment_method_id       UUID REFERENCES payment_methods(id),
    -- Coupon attached at subscription level
    coupon_id               UUID REFERENCES coupons(id),
    -- Trial boundaries
    trial_start             TIMESTAMPTZ,
    trial_end               TIMESTAMPTZ,
    -- Current billing period
    current_period_start    TIMESTAMPTZ NOT NULL,
    current_period_end      TIMESTAMPTZ NOT NULL,
    -- When the subscription was cancelled (for proration and access)
    cancelled_at            TIMESTAMPTZ,
    -- If cancel_at_period_end=true, subscription ends at period end not immediately
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
    -- Proration credit balance in smallest currency unit (carried to next invoice)
    credit_balance          BIGINT NOT NULL DEFAULT 0,
    -- Dunning policy override; NULL = use tenant default
    dunning_policy_id       UUID,   -- FK added after dunning_policies
    metadata                JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subs_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subs_customer ON subscriptions(customer_id);
CREATE INDEX idx_subs_status ON subscriptions(status) WHERE status IN ('active', 'past_due', 'trialing');
-- Scheduler queries by period_end to find due renewals
CREATE INDEX idx_subs_period_end ON subscriptions(current_period_end)
    WHERE status IN ('active', 'trialing');

-- ============================================================
-- SUBSCRIPTION METERED USAGE
-- Usage events reported during a billing period.
-- ============================================================
CREATE TABLE subscription_metered_usage (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id     UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    -- Idempotency: tenant supplies their own unique event ID
    idempotency_key     TEXT NOT NULL,
    quantity            BIGINT NOT NULL CHECK (quantity > 0),
    -- 'sum' is the only aggregation type in v1 (sum-based metered billing)
    action              TEXT NOT NULL DEFAULT 'sum' CHECK (action = 'sum'),
    -- Billing period this usage belongs to
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subscription_id, idempotency_key)
);

CREATE INDEX idx_usage_sub_period ON subscription_metered_usage(subscription_id, period_start, period_end);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    customer_id         UUID NOT NULL REFERENCES customers(id),
    subscription_id     UUID NOT NULL REFERENCES subscriptions(id),
    currency            TEXT NOT NULL,
    -- 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
    status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                            'draft', 'open', 'paid', 'void', 'uncollectible'
                        )),
    subtotal            BIGINT NOT NULL DEFAULT 0,  -- Before discounts
    discount_amount     BIGINT NOT NULL DEFAULT 0,  -- Coupon discount
    total               BIGINT NOT NULL DEFAULT 0,  -- After discount
    amount_due          BIGINT NOT NULL DEFAULT 0,  -- After credit balance applied
    amount_paid         BIGINT NOT NULL DEFAULT 0,
    -- Billing period this invoice covers
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    -- When payment collection is attempted
    due_date            TIMESTAMPTZ NOT NULL,
    paid_at             TIMESTAMPTZ,
    voided_at           TIMESTAMPTZ,
    -- Nomba charge ID for reconciliation
    nomba_charge_id     TEXT,
    -- Idempotency key for billing scheduler to prevent double-billing
    idempotency_key     TEXT NOT NULL UNIQUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_due ON invoices(due_date) WHERE status = 'open';
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);

-- ============================================================
-- INVOICE LINE ITEMS
-- ============================================================
CREATE TABLE invoice_line_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    -- 'subscription' | 'metered' | 'proration' | 'credit'
    type            TEXT NOT NULL CHECK (type IN ('subscription', 'metered', 'proration', 'credit')),
    description     TEXT NOT NULL,
    quantity        BIGINT NOT NULL DEFAULT 1,
    unit_amount     BIGINT NOT NULL,  -- In smallest currency unit
    amount          BIGINT NOT NULL,  -- quantity * unit_amount
    -- Proration period if applicable
    period_start    TIMESTAMPTZ,
    period_end      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_line_items_invoice ON invoice_line_items(invoice_id);

-- ============================================================
-- CHARGES
-- Represents each individual payment attempt against an invoice.
-- One invoice may have multiple charges (retries).
-- ============================================================
CREATE TABLE charges (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    customer_id         UUID NOT NULL REFERENCES customers(id),
    invoice_id          UUID NOT NULL REFERENCES invoices(id),
    payment_method_id   UUID REFERENCES payment_methods(id),
    currency            TEXT NOT NULL,
    amount              BIGINT NOT NULL,
    -- 'pending' | 'succeeded' | 'failed' | 'refunded'
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                            'pending', 'succeeded', 'failed', 'refunded'
                        )),
    -- Nomba's charge reference
    nomba_charge_id     TEXT,
    nomba_reference     TEXT,
    -- Raw Nomba error for debugging
    failure_code        TEXT,
    failure_message     TEXT,
    -- Refund tracking
    amount_refunded     BIGINT NOT NULL DEFAULT 0,
    refunded_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_charges_invoice ON charges(invoice_id);
CREATE INDEX idx_charges_nomba ON charges(nomba_charge_id);

-- ============================================================
-- DUNNING POLICIES
-- ============================================================
CREATE TABLE dunning_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    -- JSON array of retry schedule: [{day: 0, use_backup: true}, {day: 1}, {day: 3}, ...]
    retry_schedule  JSONB NOT NULL,
    -- After final retry: 'cancel' | 'mark_unpaid'
    final_action    TEXT NOT NULL DEFAULT 'cancel' CHECK (final_action IN ('cancel', 'mark_unpaid')),
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one default policy per tenant
CREATE UNIQUE INDEX idx_dunning_default ON dunning_policies(tenant_id) WHERE is_default = TRUE;

-- ============================================================
-- DUNNING ATTEMPTS
-- ============================================================
CREATE TABLE dunning_attempts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id     UUID NOT NULL REFERENCES subscriptions(id),
    invoice_id          UUID NOT NULL REFERENCES invoices(id),
    charge_id           UUID REFERENCES charges(id),
    attempt_number      INT NOT NULL,  -- 1-based
    scheduled_at        TIMESTAMPTZ NOT NULL,
    executed_at         TIMESTAMPTZ,
    -- 'scheduled' | 'in_progress' | 'succeeded' | 'failed' | 'skipped'
    status              TEXT NOT NULL DEFAULT 'scheduled',
    used_backup_card    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dunning_sub ON dunning_attempts(subscription_id);
CREATE INDEX idx_dunning_scheduled ON dunning_attempts(scheduled_at) WHERE status = 'scheduled';

-- ============================================================
-- WEBHOOK ENDPOINTS (tenant-registered)
-- ============================================================
CREATE TABLE webhook_endpoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    -- JSON array of event types to receive; empty array = all events
    event_types     JSONB NOT NULL DEFAULT '[]',
    -- HMAC-SHA256 signing secret for this endpoint
    signing_secret  TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_tenant ON webhook_endpoints(tenant_id) WHERE is_active = TRUE;

-- ============================================================
-- WEBHOOK DELIVERIES
-- ============================================================
CREATE TABLE webhook_deliveries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    event_type          TEXT NOT NULL,
    payload             JSONB NOT NULL,
    -- 'pending' | 'succeeded' | 'failed' | 'abandoned'
    status              TEXT NOT NULL DEFAULT 'pending',
    attempt_count       INT NOT NULL DEFAULT 0,
    next_retry_at       TIMESTAMPTZ,
    last_response_code  INT,
    last_response_body  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wh_deliveries_pending ON webhook_deliveries(next_retry_at)
    WHERE status IN ('pending', 'failed');
CREATE INDEX idx_wh_deliveries_endpoint ON webhook_deliveries(webhook_endpoint_id);

-- ============================================================
-- AUDIT LOGS
-- Append-only. No UPDATE or DELETE ever issued against this table.
-- ============================================================
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,   -- Sequential for tamper detection
    tenant_id       UUID REFERENCES tenants(id),
    -- The entity being acted upon
    resource_type   TEXT NOT NULL,           -- 'subscription', 'invoice', etc.
    resource_id     UUID NOT NULL,
    -- Actor: API key ID for tenant actions, customer ID for portal actions
    actor_type      TEXT NOT NULL,           -- 'tenant_api_key' | 'customer' | 'system'
    actor_id        TEXT,
    action          TEXT NOT NULL,           -- 'created', 'cancelled', 'charge_failed', etc.
    -- Full snapshot of changed fields (before/after)
    diff            JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs are queried by resource; range scans by time are common
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_tenant_time ON audit_logs(tenant_id, created_at DESC);

-- ============================================================
-- DEFERRED FOREIGN KEYS (added after both tables exist)
-- ============================================================
ALTER TABLE coupon_redemptions
    ADD CONSTRAINT fk_cr_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id);

ALTER TABLE subscriptions
    ADD CONSTRAINT fk_sub_dunning
    FOREIGN KEY (dunning_policy_id) REFERENCES dunning_policies(id);
```

---

## 3. Subscription State Machine

### 3.1 States

| State | Description |
|---|---|
| `trialing` | Customer is in a free trial period; no payment taken yet |
| `active` | Subscription is current; payment is up to date |
| `past_due` | Payment failed; dunning in progress |
| `paused` | Tenant has paused the subscription; no billing occurs |
| `unpaid` | Dunning exhausted; subscription is alive but access is blocked |
| `cancelled` | Subscription cancelled; access ends at `current_period_end` if cancel_at_period_end=true, else immediately |
| `ended` | Terminal state; subscription has fully concluded |

### 3.2 Transition Table

| # | From State | Event | Guard Condition | To State | Side Effects |
|---|---|---|---|---|---|
| T01 | *(none)* | `subscription.create` with trial | `plan.trial_days > 0` | `trialing` | Insert subscription; emit `subscription.trialing` webhook; log audit |
| T02 | *(none)* | `subscription.create` without trial | `plan.trial_days = 0`; payment method present | `active` | Insert subscription; generate first invoice; charge card; emit `subscription.activated`; log audit |
| T03 | `trialing` | `trial.ended` (scheduler) | `NOW() >= trial_end` | `active` | Generate first invoice; attempt charge; if charge succeeds → emit `subscription.activated`; if fails → T04 |
| T04 | `trialing` | `charge.failed` (trial conversion) | Charge attempt fails | `past_due` | Create dunning record; emit `subscription.payment_failed`; log audit |
| T05 | `active` | `invoice.due` (scheduler) | `NOW() >= current_period_end` | `active` | Generate renewal invoice; attempt charge; advance billing period on success; emit `subscription.renewed` |
| T06 | `active` | `charge.failed` (renewal) | Charge attempt fails | `past_due` | Create dunning record; emit `subscription.payment_failed`; log audit |
| T07 | `past_due` | `dunning.retry_succeeded` | Dunning charge succeeds | `active` | Mark invoice paid; cancel remaining dunning attempts; emit `subscription.reactivated`; log audit |
| T08 | `past_due` | `dunning.exhausted` | All retries failed; `final_action = 'cancel'` | `cancelled` | Set `cancelled_at`; emit `subscription.cancelled`; log audit |
| T09 | `past_due` | `dunning.exhausted` | All retries failed; `final_action = 'mark_unpaid'` | `unpaid` | Emit `subscription.unpaid`; log audit |
| T10 | `past_due` | `customer.updated_payment_method` | New valid card saved | `active` | Trigger immediate charge attempt with new card; if succeeds → T07 |
| T11 | `active` | `subscription.cancel` (immediate) | Tenant or customer cancel request | `cancelled` | Set `cancelled_at = NOW()`; proration credit if applicable; emit `subscription.cancelled` |
| T12 | `active` | `subscription.cancel` (at_period_end) | `cancel_at_period_end = true` | `active` | Set flag; no immediate state change; emit `subscription.cancel_scheduled` |
| T13 | `active` | `period.end` with `cancel_at_period_end` | `cancel_at_period_end = true`; `NOW() >= current_period_end` | `cancelled` | Emit `subscription.cancelled`; log audit |
| T14 | `active` | `subscription.pause` | Tenant request | `paused` | Set `paused_at`; emit `subscription.paused`; log audit |
| T15 | `paused` | `subscription.resume` | Tenant request | `active` | Set new `current_period_start/end`; emit `subscription.resumed` |
| T16 | `active` | `subscription.upgrade` | New plan has higher price | `active` | Generate proration invoice; charge immediately; update `plan_id`; emit `subscription.updated` |
| T17 | `active` | `subscription.downgrade` | New plan has lower price | `active` | Calculate proration credit; apply to `credit_balance`; update `plan_id` at next period; emit `subscription.updated` |
| T18 | `cancelled` | `period.end` | `NOW() >= current_period_end` | `ended` | Emit `subscription.ended`; log audit |
| T19 | `unpaid` | `customer.updated_payment_method` | New valid card saved | `active` | Trigger immediate charge attempt for outstanding invoice |

### 3.3 ASCII State Diagram

```
                    ┌─────────────────┐
                    │   [START]       │
                    └────────┬────────┘
                             │ create (no trial)         create (with trial)
                    ┌────────▼────────┐                 ┌─────────────────┐
                    │    ACTIVE       │◄────────────────│    TRIALING     │
                    └────────┬────────┘  trial ends,    └────────┬────────┘
                             │           charge ok               │
                   ┌─────────┴──────────┐                       │ trial ends,
                   │                    │                        │ charge fails
                cancel           charge fails                    ▼
               (immediate)             │               ┌─────────────────┐
                   │            ┌──────▼──────┐        │    PAST_DUE     │
                   │            │  PAST_DUE   │◄───────┘        │
                   │            └──────┬──────┘                 │
                   │                   │                         │
                   │          dunning exhausted        dunning exhausted
                   │         (final=cancel) │         (final=unpaid)
                   │                   │         ┌───────────────┘
                   │            ┌──────▼───┐  ┌──▼──────┐
                   │            │CANCELLED │  │ UNPAID  │
                   │            └──────────┘  └─────────┘
                   │                 │              │ card updated,
                   │         period  │              │ charge ok
                   │         ends    ▼              └──────────► ACTIVE
                   │            ┌────────┐
                   └───────────►│ ENDED  │
                                └────────┘

 ─────────────────────────────────────────────────────────────
 ACTIVE ──pause──► PAUSED ──resume──► ACTIVE
 ACTIVE ──upgrade/downgrade──► ACTIVE (plan_id changes)
 ACTIVE ──cancel_at_period_end──► ACTIVE ──period_end──► CANCELLED
```

---

## 4. Nomba Integration Specification

> **Rationale:** All Nomba calls go through a single typed client (`src/infra/nomba/client.ts`) with centralised retry logic, logging, and error mapping. No raw `fetch` calls to Nomba outside this module.

### 4.1 Checkout API (First Payment + Tokenisation)

**When called:** When creating a subscription that requires immediate payment or when a customer adds a payment method via the hosted portal.

**Endpoint:** `POST https://api.nomba.com/v1/checkout/order`

**Request payload:**
```json
{
  "orderReference": "recurva_sub_{subscription_id}_{timestamp}",
  "customerId": "{nomba_account_id}",
  "amount": 5000,
  "currency": "NGN",
  "callbackUrl": "https://app.recurva.io/nomba/webhook",
  "returnUrl": "https://checkout.recurva.io/complete/{subscription_id}",
  "saveCard": true,
  "metadata": {
    "recurva_subscription_id": "{subscription_id}",
    "recurva_customer_id": "{customer_id}",
    "recurva_invoice_id": "{invoice_id}"
  }
}
```

**Success response mapping:**

| Nomba field | Recurva action |
|---|---|
| `data.checkoutUrl` | Return to tenant; customer redirected here |
| `data.orderReference` | Store on `invoices.nomba_charge_id` |
| `data.status = "PENDING"` | Invoice stays `open`; await webhook |

**Error responses:**

| Nomba error code | Recurva handling |
|---|---|
| `INVALID_ACCOUNT` | Return `nomba_account_misconfigured` error to tenant |
| `DUPLICATE_REFERENCE` | Regenerate `orderReference` with new timestamp; retry once |
| `AMOUNT_TOO_LOW` | Return `invalid_amount` validation error |
| `CURRENCY_NOT_SUPPORTED` | Return `currency_not_supported` error |
| `5xx / network timeout` | Retry with exponential backoff (see §4.6) |

### 4.2 Tokenised Card Charge (Recurring)

**When called:** Every billing cycle renewal, dunning retries, proration charges.

**Endpoint:** `POST https://api.nomba.com/v1/accounts/{nomba_account_id}/charges/tokenized`

**Request payload:**
```json
{
  "token": "{payment_method.nomba_token}",
  "amount": 5000,
  "currency": "NGN",
  "transactionReference": "recurva_charge_{charge_id}",
  "callbackUrl": "https://app.recurva.io/nomba/webhook",
  "metadata": {
    "recurva_charge_id": "{charge_id}",
    "recurva_invoice_id": "{invoice_id}",
    "recurva_subscription_id": "{subscription_id}"
  }
}
```

**Success response mapping:**

| Nomba field | Recurva action |
|---|---|
| `data.status = "SUCCESS"` | Mark `charges.status = 'succeeded'`; mark invoice paid; advance billing period |
| `data.transactionId` | Store as `charges.nomba_reference` |

**Error responses:**

| Nomba error | Recurva handling |
|---|---|
| `INSUFFICIENT_FUNDS` | Mark charge failed; non-retriable; proceed to dunning |
| `CARD_DECLINED` | Mark charge failed; non-retriable; proceed to dunning |
| `EXPIRED_CARD` | Mark charge failed; non-retriable; emit `payment_method.expired` webhook |
| `INVALID_TOKEN` | Mark charge failed; mark payment_method invalid; try backup card |
| `DO_NOT_HONOR` | Mark charge failed; non-retriable |
| `TRANSACTION_NOT_PERMITTED` | Mark charge failed; non-retriable |
| `TIMEOUT` / `5xx` | Retriable — see §4.6 |

### 4.3 Webhook Events Received from Nomba

**Inbound endpoint:** `POST /nomba/webhook`

**Event routing map:**

| Nomba event type | Recurva action |
|---|---|
| `charge.success` | Mark charge succeeded; mark invoice paid; advance billing period; emit tenant webhook |
| `charge.failed` | Mark charge failed; trigger dunning or next dunning step |
| `checkout.completed` | Extract card token; create `payment_methods` record; activate subscription |
| `checkout.abandoned` | If subscription still `trialing`, leave; notify tenant |
| `refund.success` | Update `charges.amount_refunded`; emit `charge.refunded` tenant webhook |

### 4.4 Webhook Signature Verification

Nomba signs all inbound webhooks with HMAC-SHA256. Recurva verifies before processing any event.

**Step-by-step:**

```
1. Extract header: X-Nomba-Signature: sha256={hex_digest}
2. Read raw request body as UTF-8 string (not parsed JSON)
3. Compute: HMAC-SHA256(key=NOMBA_WEBHOOK_SECRET, message=raw_body)
4. Hex-encode the result
5. Use timingSafeEqual() comparison to prevent timing attacks
6. If mismatch → return HTTP 401; log warning; do NOT process
7. If match → parse JSON and route event
```

**Idempotency:**

```
1. Extract event ID from payload: payload.eventId
2. Query: SELECT id FROM webhook_deliveries WHERE nomba_event_id = $1
3. If found → return HTTP 200 immediately (already processed)
4. If not found → process event; insert record atomically in same transaction
```

### 4.5 Refund API

**When called:** Tenant requests a refund via `POST /charges/{id}/refund`.

**Endpoint:** `POST https://api.nomba.com/v1/accounts/{nomba_account_id}/refunds`

**Request payload:**
```json
{
  "transactionId": "{charges.nomba_reference}",
  "amount": 2500,
  "reason": "Customer requested",
  "reference": "recurva_refund_{charge_id}_{timestamp}"
}
```

**Success:** Update `charges.amount_refunded`; emit `charge.refunded` webhook to tenant.

**Partial refund:** Supported — `amount` can be less than the original. Multiple partial refunds allowed until `amount_refunded = amount`.

### 4.6 Retry Strategy for Transient Nomba Errors

Only network errors and 5xx responses are retried. Business errors (card declined, insufficient funds) are **never** retried by the HTTP client — they go to the dunning engine instead.

```
Attempt 1: immediate
Attempt 2: +1 second
Attempt 3: +2 seconds
Attempt 4: +4 seconds
Maximum: 3 retries (4 total attempts)
Jitter: ±200ms random jitter added to each delay
Timeout per attempt: 10 seconds
```

After 4 failed attempts, log critical error, mark charge as `failed` with `failure_code = 'nomba_unreachable'`, and alert on-call.

---

## 5. Billing Engine Specification

### 5.1 Invoice Generation Logic

The billing scheduler runs every 5 minutes and queries:

```sql
SELECT * FROM subscriptions
WHERE status IN ('active', 'trialing')
  AND current_period_end <= NOW() + INTERVAL '5 minutes'
FOR UPDATE SKIP LOCKED;
```

`SKIP LOCKED` prevents multiple scheduler workers from billing the same subscription. This is the primary concurrency control mechanism.

**Invoice generation sequence:**

```
1. Acquire row lock (SKIP LOCKED)
2. Check idempotency_key = 'invoice_{subscription_id}_{period_start_unix}'
   → If invoice exists for this key, skip (already billed)
3. Create invoice in 'draft' status
4. Add line items:
   a. Fixed: one line item for the plan amount
   b. Metered: aggregate usage (see §5.4); one line item per metered component
   c. Mixed: both (a) and (b)
5. Apply coupon discount (see §5.3)
6. Apply credit balance from subscription.credit_balance
7. Set invoice.total and invoice.amount_due
8. Transition invoice → 'open'
9. Initiate charge attempt
10. On success: advance billing period, emit webhook
11. On failure: enter dunning
```

### 5.2 Multi-Currency Handling

**Design decision: Currency locked at subscription creation. No live exchange rate conversion.**

Rationale: Live rates introduce unpredictable billing amounts and add external API dependency in the critical billing path. By locking the currency at subscription creation, customers always pay the exact amount they signed up for. Tenants offering multiple currencies create separate plans per currency.

**Implementation:**

- `subscriptions.currency` is set when the subscription is created, copied from the selected `plan_currencies` row
- All invoice amounts are stored and charged in `subscriptions.currency`
- If a plan is deprecated and the currency removed, existing subscriptions continue at the locked rate; new subscriptions cannot choose that plan/currency combination

### 5.3 Coupon Application to Invoices

```
1. Check subscription.coupon_id is not null
2. Load coupon; verify it has not expired and is still active
3. Load coupon_redemptions record for this subscription
4. Check duration eligibility:
   - 'once': apply only if months_applied = 0
   - 'repeating': apply only if months_applied < duration_months
   - 'forever': always apply
5. Calculate discount:
   - 'percentage': discount = FLOOR(subtotal * value / 100)
   - 'fixed_amount': discount = MIN(value, subtotal)  [never negative]
     → Fixed amount coupons must match invoice currency or are skipped
6. Set invoice.discount_amount = discount
7. Set invoice.total = subtotal - discount
8. Update coupon_redemptions.months_applied += 1
```

### 5.4 Metered Usage Aggregation

At billing time, for `metered` or `mixed` plans:

```sql
SELECT SUM(quantity) AS total_units
FROM subscription_metered_usage
WHERE subscription_id = $1
  AND period_start >= $2   -- current_period_start
  AND period_end   <= $3;  -- current_period_end
```

Usage is deleted after the invoice is finalised to prevent double-counting on retries. Deletion happens inside the same transaction as invoice creation.

`unit_amount` for the metered component comes from `plan_currencies` where `currency = subscription.currency`.

### 5.5 Proration Formulas

**Definitions:**

```
D = days remaining in current period
T = total days in current period
old_amount = current plan amount (in smallest unit)
new_amount = new plan amount (in smallest unit)
daily_old = old_amount / T
daily_new = new_amount / T
```

**Upgrade mid-cycle (immediate effect):**

```
proration_credit  = FLOOR(daily_old * D)   ← unused days of old plan
proration_charge  = FLOOR(daily_new * D)   ← days on new plan
net_charge        = proration_charge - proration_credit

If net_charge > 0: generate proration invoice; charge immediately
If net_charge <= 0: add |net_charge| to subscription.credit_balance
```

**Downgrade mid-cycle (takes effect next period):**

```
No charge today.
credit = FLOOR(daily_old * D) - FLOOR(daily_new * D)
subscription.credit_balance += credit
Plan change recorded; new amount billed from next period start.
```

**Cancellation mid-cycle with credit:**

```
credit = FLOOR(daily_old * D)
subscription.credit_balance += credit
If tenant has enabled refund_on_cancel:
  refund MIN(credit, last_charge.amount) via Nomba refund API
Else:
  credit sits in balance (useful if customer re-subscribes)
```

> **Rounding:** Always use `FLOOR` (round down in favour of the customer) and operate in smallest currency units to avoid floating-point errors.

### 5.6 Idempotency Design for the Billing Scheduler

Every invoice is created with a deterministic `idempotency_key`:

```
idempotency_key = sha256("invoice_{subscription_id}_{period_start_unix_seconds}")
```

The `invoices.idempotency_key` column has a `UNIQUE` constraint. If the scheduler crashes mid-run and restarts, the `INSERT` for any already-created invoice will fail with a unique constraint violation, which is caught and treated as "already done — skip." The lock released by `SKIP LOCKED` ensures another worker never processes the same row concurrently.

---

## 6. Dunning Engine Specification

### 6.1 Default Schedule (Nigerian Market)

The default schedule is tuned for Nigerian salary cycles (salaries paid on the 25th–28th of each month), where card failures mid-month are often temporary.

| Day | Action | Card Used | Email Hook |
|---|---|---|---|
| 0 | Immediate retry with backup card (if exists) | Backup → Primary | None |
| 1 | Retry primary card | Primary | `dunning.first_notice` |
| 3 | Retry primary card | Primary | `dunning.warning` |
| 7 | Retry primary card | Primary | `dunning.final_notice` |
| 10 | Cancel subscription | — | `dunning.cancelled` |

Day 0 is triggered immediately when the initial charge webhook `charge.failed` arrives. Days 1, 3, 7 are scheduled as jobs relative to `dunning_attempts.created_at` (the timestamp of the first failure).

### 6.2 Configurable Dunning Policy

Tenants can create custom dunning policies via the API:

```json
{
  "name": "Enterprise Dunning",
  "retry_schedule": [
    { "day": 0, "use_backup": true },
    { "day": 2 },
    { "day": 5 },
    { "day": 14 },
    { "day": 21 }
  ],
  "final_action": "mark_unpaid"
}
```

Tenants can set a custom policy on individual subscriptions (`subscriptions.dunning_policy_id`). If null, the tenant's default policy is used (`dunning_policies.is_default = true`). If no custom policy exists, Recurva's built-in default applies.

Email hooks: Recurva does not send email directly. At each dunning step, Recurva fires a tenant outbound webhook event (`dunning.first_notice`, etc.) with the customer details. The tenant's application is responsible for sending the actual email. This keeps Recurva transport-agnostic.

### 6.3 Backup Card Fallback in Dunning

```
Day 0 flow:
1. Charge fails on primary card
2. Check: does customer have a payment method with is_backup = TRUE?
3. If yes:
   a. Attempt charge on backup card
   b. If backup succeeds → T07 (subscription reactivates)
   c. If backup fails → proceed to Day 1 schedule on primary card
4. If no backup card → proceed directly to Day 1 schedule
```

### 6.4 Events Emitted at Each Dunning Step

| Step | Outbound webhook event | Payload includes |
|---|---|---|
| Charge fails (initial) | `subscription.payment_failed` | invoice_id, amount, attempt=1 |
| Day 0 backup tried | `subscription.payment_failed` | invoice_id, amount, attempt=2, card=backup |
| Day 1 retry | `dunning.first_notice` | customer details, amount_due, days_until_cancel=9 |
| Day 3 retry | `dunning.warning` | customer details, amount_due, days_until_cancel=7 |
| Day 7 retry | `dunning.final_notice` | customer details, amount_due, days_until_cancel=3 |
| Day 10 cancel | `subscription.cancelled` | reason='dunning_exhausted' |

### 6.5 Customer Self-Cure

```
1. Customer visits self-serve portal
2. Customer updates payment method (adds new card via Nomba checkout)
3. Recurva receives checkout.completed webhook from Nomba
4. New payment_method created; set as primary
5. If subscription.status = 'past_due':
   a. Find open invoice linked to current dunning sequence
   b. Cancel remaining scheduled dunning_attempts
   c. Attempt immediate charge with new card
   d. If succeeds → T07 (subscription.status = 'active')
   e. If fails → resume dunning from where it was (do not reset to Day 0)
```

---

## 7. Coupon Engine Specification

### 7.1 Coupon Data Model

```
code            — Unique per tenant; case-insensitive at validation
discount_type   — 'percentage' | 'fixed_amount'
discount_value  — Percentage (0–100) or fixed amount in smallest unit
currency        — Required for fixed_amount; must match invoice currency
duration        — 'once' | 'repeating' | 'forever'
duration_months — Required when duration='repeating'
max_redemptions — NULL = unlimited subscriptions can use this coupon
redemption_count — Incremented when coupon is attached to a subscription
expires_at      — NULL = no expiry
```

### 7.2 Validation Rules at Redemption Time

```
1. Coupon exists for this tenant (case-insensitive code match)
2. is_active = TRUE
3. expires_at IS NULL OR expires_at > NOW()
4. max_redemptions IS NULL OR redemption_count < max_redemptions
5. For fixed_amount: coupon.currency = subscription.currency
6. Coupon not already attached to this subscription
   (UNIQUE constraint on coupon_redemptions(coupon_id, subscription_id))
7. All checks inside a serializable transaction to prevent race conditions
   on max_redemptions
```

### 7.3 Coupon Application to Invoice Line Items

Coupon discount is applied at the invoice level, not per line item. A single `discount` line item is added:

```
{
  type: 'discount',
  description: '20% off — LAUNCH20',
  amount: -1000   ← negative amount reduces invoice total
}
```

For mixed plans (fixed + metered), the discount applies to the combined subtotal.

### 7.4 Repeating Coupons Across Billing Cycles

`coupon_redemptions.months_applied` tracks how many billing cycles the discount has been applied. It is incremented inside the same transaction as invoice creation:

```
UPDATE coupon_redemptions
SET months_applied = months_applied + 1
WHERE subscription_id = $1 AND coupon_id = $2;
```

When `months_applied >= duration_months`, the coupon is no longer applied in subsequent cycles. The coupon record and redemption record are retained for audit purposes.

### 7.5 Edge Cases

**Coupon on metered invoice:** Applies to the full subtotal of the metered invoice including all usage charges.

**Coupon on prorated invoice:** Proration invoices (upgrade) also receive the coupon discount if the coupon is active and eligible. The discount is calculated on the prorated amount, not the full plan amount. This is the most customer-friendly interpretation.

**Coupon + free trial:** Coupon is stored on the subscription at creation. It activates on the first real invoice after the trial ends. The `once` coupon applies to the first paid invoice; `repeating` applies to the first N paid invoices.

---

## 8. Multiple Payment Methods Specification

### 8.1 How Multiple Cards Are Stored

Each payment method stored in `payment_methods` represents a tokenised card returned by Nomba after a successful checkout. Customers can add multiple cards. The `nomba_token` is used for all subsequent charges — Recurva never stores card numbers or CVVs.

### 8.2 Primary vs Backup Card Designation

- **Primary card**: The card used for all regular billing. One per customer enforced by partial unique index.
- **Backup card**: The fallback used on Day 0 of dunning. One per customer enforced by partial unique index.
- A card can be primary for one subscription and backup for another? No — primary/backup are customer-level designations, not subscription-level.
- Cards that are neither primary nor backup remain on file and can be promoted.

### 8.3 Changing Primary Card via Portal

```
1. Customer selects a saved card in the portal and clicks "Set as primary"
2. PUT /portal/payment-methods/{id}/primary (authenticated by customer JWT)
3. Recurva:
   a. BEGIN transaction
   b. UPDATE payment_methods SET is_primary = FALSE WHERE customer_id = $1
   c. UPDATE payment_methods SET is_primary = TRUE  WHERE id = $2
   d. Update all active subscriptions:
      UPDATE subscriptions SET payment_method_id = $2
      WHERE customer_id = $1 AND status IN ('active', 'past_due', 'trialing')
   e. COMMIT
4. Emit customer.payment_method_updated webhook
```

### 8.4 What Happens When Both Cards Fail

```
Day 0: Backup card attempted → fails
Day 1: Primary card attempted → fails
Day 3: Primary card attempted → fails
Day 7: Primary card attempted → fails
Day 10: final_action executed:
  - 'cancel': subscription → cancelled; emit subscription.cancelled
  - 'mark_unpaid': subscription → unpaid; emit subscription.unpaid
```

After `unpaid`, the subscription is kept alive in the database but no billing occurs. If the customer adds a new card later, billing resumes and a charge is attempted for the outstanding invoice.

---

## 9. Webhook System Specification

### 9.1 Inbound Webhooks (From Nomba)

**Endpoint:** `POST /nomba/webhook`

**Authentication:** HMAC-SHA256 signature verification (see §4.4). No API key required — Nomba does not support API key on webhook delivery.

**Processing pipeline:**

```
1. Read raw body (do NOT parse yet)
2. Verify HMAC-SHA256 signature
3. If invalid: return 401; log with request ID
4. Parse JSON
5. Extract eventId
6. Check idempotency: SELECT FROM nomba_events WHERE event_id = $eventId
7. If exists: return 200 (already processed)
8. Begin transaction:
   a. Insert nomba_event record
   b. Route event to handler (see routing map in §4.3)
   c. Handler performs domain logic
   d. Commit
9. Return 200
10. If handler throws: rollback; return 500; Nomba will retry
```

**Nomba retry behaviour:** Nomba retries failed webhook deliveries (non-2xx) up to 3 times with exponential backoff. Recurva must be idempotent — returning 500 is safe because the idempotency check prevents double-processing on retry.

### 9.2 Outbound Webhooks (To Tenant Apps)

#### Full Event Catalog

| Event | Trigger | Key Payload Fields |
|---|---|---|
| `subscription.trialing` | Trial started | subscription_id, trial_end |
| `subscription.activated` | First payment succeeded | subscription_id, plan_id, current_period_end |
| `subscription.renewed` | Renewal payment succeeded | subscription_id, invoice_id, period_start, period_end |
| `subscription.updated` | Plan changed | subscription_id, old_plan_id, new_plan_id |
| `subscription.payment_failed` | Charge failed | subscription_id, invoice_id, attempt_count, next_retry_at |
| `subscription.reactivated` | Dunning recovered | subscription_id, invoice_id |
| `subscription.paused` | Subscription paused | subscription_id, paused_at |
| `subscription.resumed` | Subscription resumed | subscription_id, current_period_end |
| `subscription.cancel_scheduled` | cancel_at_period_end set | subscription_id, cancels_at |
| `subscription.cancelled` | Subscription cancelled | subscription_id, reason, cancelled_at |
| `subscription.ended` | Cancellation period ended | subscription_id, ended_at |
| `subscription.unpaid` | Dunning ended, unpaid | subscription_id, outstanding_amount |
| `dunning.first_notice` | Day 1 retry | customer_id, amount_due, next_retry_at |
| `dunning.warning` | Day 3 retry | customer_id, amount_due, next_retry_at |
| `dunning.final_notice` | Day 7 retry | customer_id, amount_due, cancels_at |
| `invoice.created` | Invoice generated | invoice_id, amount, period |
| `invoice.paid` | Invoice paid | invoice_id, amount_paid, paid_at |
| `invoice.voided` | Invoice voided | invoice_id, voided_at |
| `charge.succeeded` | Charge succeeded | charge_id, amount, payment_method_last4 |
| `charge.failed` | Charge failed | charge_id, failure_code, failure_message |
| `charge.refunded` | Refund issued | charge_id, amount_refunded |
| `customer.payment_method_updated` | Card changed | customer_id, payment_method_id |
| `payment_method.expired` | Card expired on charge | payment_method_id, card_last4 |

**Standard payload envelope:**

```json
{
  "id": "evt_01HZXYZ...",
  "type": "subscription.activated",
  "created_at": "2025-01-15T14:23:00Z",
  "tenant_id": "ten_...",
  "data": {
    "object": { ...resource fields... }
  }
}
```

#### Delivery Mechanism and Retry Policy

```
Attempt 1: immediate
Attempt 2: +30 seconds
Attempt 3: +5 minutes
Attempt 4: +30 minutes
Attempt 5: +2 hours
Attempt 6: +8 hours (abandoned after this)

Success condition: HTTP 2xx response within 10 seconds
Non-2xx or timeout: mark failed; schedule next attempt
After attempt 6: status = 'abandoned'; emit alert to tenant dashboard
```

#### Tenant Webhook Registration

`POST /webhooks/endpoints` with `{ url, event_types: [] }`. Empty `event_types` = subscribe to all events. Recurva generates a unique `signing_secret` per endpoint and returns it **once** at registration. Tenant must store it immediately.

#### Outbound Webhook Signing

Recurva signs each delivery so tenants can verify authenticity:

```
1. Serialize payload to JSON string
2. Compute: HMAC-SHA256(key=endpoint.signing_secret, message=payload_json)
3. Add header: Recurva-Signature: t={timestamp},v1={hex_digest}
4. Tenant verifies:
   a. Extract timestamp and signature from header
   b. Recompute HMAC on received body
   c. Compare with timingSafeEqual
   d. Optionally check |NOW - timestamp| < 300 seconds (replay protection)
```

#### Delivery Audit Log

Every delivery attempt is recorded in `webhook_deliveries`. The table retains all records indefinitely (configurable retention via admin job). The `payload` column contains the exact JSON sent; `last_response_body` contains up to 1000 chars of the response for debugging.

---

## 10. API Specification

### Authentication

**Tenant API Key:** Send as `Authorization: Bearer rk_live_{key}`. Recurva hashes the incoming key with SHA-256 and looks up the hash in `tenant_api_keys`. All tenant management endpoints require this.

**Customer JWT:** Portal and self-serve endpoints accept a short-lived JWT issued by `POST /portal/auth/token`. Payload: `{ sub: customer_id, tenant_id, iat, exp }`.

### Rate Limiting

| Auth type | Limit |
|---|---|
| Tenant API key | 1,000 req/min per key |
| Customer JWT | 60 req/min per customer |
| Inbound Nomba webhook | No limit (IP allowlisted to Nomba IPs) |

Rate limit headers returned on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

### Auth

#### `POST /auth/token`
Issue a short-lived customer portal JWT.

**Auth:** Tenant API key  
**Body:**
```typescript
z.object({
  customer_id: z.string().uuid()
})
```
**Response 200:**
```json
{ "token": "eyJ...", "expires_at": "2025-01-15T15:23:00Z" }
```
**Errors:** `customer_not_found` (404), `rate_limit_exceeded` (429)

---

### Tenants

#### `POST /tenants`
Create a new tenant (admin endpoint; internal use only).

#### `GET /tenants/me`
**Auth:** Tenant API key  
**Response:** Tenant object

#### `PATCH /tenants/me`
**Auth:** Tenant API key  
**Body:** `z.object({ name: z.string().optional(), email: z.string().email().optional() })`

---

### Plans

#### `POST /plans`
**Auth:** Tenant API key  
**Body:**
```typescript
z.object({
  name: z.string().min(1),
  billing_type: z.enum(['fixed', 'metered', 'mixed']),
  interval: z.enum(['day', 'week', 'month', 'year']),
  interval_count: z.number().int().positive().default(1),
  trial_days: z.number().int().nonnegative().optional(),
  currencies: z.array(z.object({
    currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']),
    amount: z.number().int().nonnegative(),
    unit_amount: z.number().int().nonnegative().optional()
  })).min(1)
})
```
**Response 201:** Plan object  
**Errors:** `duplicate_currency` (422)

#### `GET /plans`
**Auth:** Tenant API key  
**Query:** `?active=true&limit=20&cursor=`  
**Response 200:** `{ data: Plan[], next_cursor: string | null }`

#### `GET /plans/:id`
**Auth:** Tenant API key

#### `PATCH /plans/:id`
**Auth:** Tenant API key  
**Note:** Cannot change `billing_type` or `interval` on plans with active subscriptions.

#### `DELETE /plans/:id`
Soft delete — sets `is_active = false`. Returns 409 if active subscriptions exist.

---

### Coupons

#### `POST /coupons`
**Auth:** Tenant API key  
**Body:**
```typescript
z.object({
  code: z.string().min(3).max(50).toUpperCase(),
  discount_type: z.enum(['percentage', 'fixed_amount']),
  discount_value: z.number().int().positive(),
  currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']).optional(),
  duration: z.enum(['once', 'repeating', 'forever']),
  duration_months: z.number().int().positive().optional(),
  max_redemptions: z.number().int().positive().optional(),
  expires_at: z.string().datetime().optional()
}).refine(d => {
  if (d.discount_type === 'fixed_amount' && !d.currency) return false;
  if (d.duration === 'repeating' && !d.duration_months) return false;
  if (d.discount_type === 'percentage' && d.discount_value > 100) return false;
  return true;
})
```
**Response 201:** Coupon object  
**Errors:** `duplicate_code` (409)

#### `GET /coupons`, `GET /coupons/:id`, `DELETE /coupons/:id`
Standard CRUD; delete is soft (`is_active = false`).

---

### Customers

#### `POST /customers`
**Auth:** Tenant API key  
**Body:**
```typescript
z.object({
  email: z.string().email(),
  name: z.string().optional(),
  external_id: z.string().optional(),
  currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']).default('NGN'),
  metadata: z.record(z.string()).optional()
})
```
**Response 201:** Customer object  
**Errors:** `duplicate_email` (409), `duplicate_external_id` (409)

#### `GET /customers`, `GET /customers/:id`, `PATCH /customers/:id`
Standard CRUD.

---

### Payment Methods

#### `POST /customers/:id/payment-methods/setup`
Generate a Nomba checkout URL for adding a card without charging.

**Auth:** Tenant API key  
**Response 200:** `{ checkout_url: string }`

#### `GET /customers/:id/payment-methods`
**Auth:** Tenant API key  
**Response 200:** `{ data: PaymentMethod[] }`

#### `DELETE /customers/:id/payment-methods/:pm_id`
Cannot delete the primary card if active subscriptions exist.

#### `PUT /customers/:id/payment-methods/:pm_id/primary`
Set a card as primary. See §8.3 for transactional logic.

#### `PUT /customers/:id/payment-methods/:pm_id/backup`
Set a card as backup card.

---

### Subscriptions

#### `POST /subscriptions`
**Auth:** Tenant API key  
**Body:**
```typescript
z.object({
  customer_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']),
  coupon_code: z.string().optional(),
  payment_method_id: z.string().uuid().optional(),
  // If no payment_method_id, checkout URL is returned for first payment
  metadata: z.record(z.string()).optional()
})
```
**Response 201:** `{ subscription: Subscription, checkout_url?: string }`

#### `GET /subscriptions`, `GET /subscriptions/:id`
**Auth:** Tenant API key

#### `POST /subscriptions/:id/cancel`
**Body:** `z.object({ at_period_end: z.boolean().default(true) })`

#### `POST /subscriptions/:id/pause`
#### `POST /subscriptions/:id/resume`

#### `POST /subscriptions/:id/update-plan`
**Body:** `z.object({ plan_id: z.string().uuid(), prorate: z.boolean().default(true) })`  
**Response:** Updated subscription + proration invoice if applicable.

---

### Usage (Metered Billing)

#### `POST /subscriptions/:id/usage`
Report metered usage.

**Auth:** Tenant API key  
**Body:**
```typescript
z.object({
  quantity: z.number().int().positive(),
  idempotency_key: z.string().min(1).max(255),
  timestamp: z.string().datetime().optional()  // defaults to NOW()
})
```
**Response 201:** Usage record  
**Errors:** `duplicate_idempotency_key` (200, returns existing record — idempotent)

#### `GET /subscriptions/:id/usage`
**Query:** `?period_start=&period_end=`

---

### Invoices

#### `GET /invoices`
**Auth:** Tenant API key  
**Query:** `?customer_id=&subscription_id=&status=`

#### `GET /invoices/:id`

#### `POST /invoices/:id/void`
Can only void `open` invoices.

#### `POST /charges/:id/refund`
**Body:** `z.object({ amount: z.number().int().positive().optional() })`  
Partial refund supported. Amount must not exceed `amount - amount_refunded`.

---

### Webhooks

#### `POST /webhooks/endpoints`
**Body:** `z.object({ url: z.string().url(), event_types: z.array(z.string()).default([]) })`  
**Response 201:** Endpoint object including `signing_secret` (returned **once only**)

#### `GET /webhooks/endpoints`, `GET /webhooks/endpoints/:id`
#### `PATCH /webhooks/endpoints/:id`
#### `DELETE /webhooks/endpoints/:id`

#### `GET /webhooks/deliveries`
**Query:** `?endpoint_id=&status=&limit=`

#### `POST /webhooks/deliveries/:id/retry`
Manually retry a failed delivery.

---

### Portal (Customer JWT Auth)

#### `GET /portal/subscription`
Customer's active subscription.

#### `GET /portal/invoices`
Customer's invoice history.

#### `GET /portal/payment-methods`
Customer's saved cards (masked).

#### `PUT /portal/payment-methods/:id/primary`

#### `POST /portal/payment-methods/setup`
Generate checkout URL to add new card.

#### `DELETE /portal/payment-methods/:id`

---

### Reporting

#### `GET /reporting/mrr`
**Auth:** Tenant API key  
**Query:** `?from=&to=` (ISO dates)  
**Response:** `{ mrr: number, currency: string, period: { from, to } }`

**MRR calculation:**
```sql
SELECT SUM(
  CASE plan.interval
    WHEN 'month' THEN pc.amount
    WHEN 'year'  THEN pc.amount / 12
    WHEN 'week'  THEN pc.amount * 52 / 12
    WHEN 'day'   THEN pc.amount * 365 / 12
  END
) AS mrr
FROM subscriptions s
JOIN plans p ON s.plan_id = p.id
JOIN plan_currencies pc ON pc.plan_id = p.id AND pc.currency = s.currency
WHERE s.tenant_id = $1
  AND s.status IN ('active', 'trialing');
```

#### `GET /reporting/churn`
**Auth:** Tenant API key  
**Query:** `?from=&to=`  
**Response:** `{ churned_count, new_count, churn_rate_percent, period }`

#### `GET /reporting/revenue`
Revenue collected per period.

---

## 11. Security Specification

### 11.1 API Key Generation and Hashing

**Generation:**

```typescript
const rawKey = `rk_${env === 'live' ? 'live' : 'test'}_${crypto.randomBytes(32).toString('base64url')}`;
// Example: rk_live_{base64url-encoded-random-bytes}
```

**Storage:** SHA-256 hash only. The raw key is returned to the tenant once at creation and never stored.

```typescript
const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
```

**Rationale for SHA-256 over bcrypt:** API keys are long random strings (256 bits of entropy), unlike passwords which have low entropy and need bcrypt's cost factor. SHA-256 lookup is constant time (via `timingSafeEqual`) and fast enough for high-frequency API calls where bcrypt's intentional slowness would add unacceptable latency.

**Key prefix** (e.g., `rk_live_abc12`) is stored in plaintext for identification in the dashboard. Prefix is the first 12 characters, which does not meaningfully reduce security.

### 11.2 Webhook HMAC Signing

**Algorithm:** HMAC-SHA256  
**Key rotation:** Tenants can rotate signing secrets via `POST /webhooks/endpoints/:id/rotate-secret`. The new secret is returned once; the old secret remains valid for 24 hours (grace period) to allow tenants to update their verification code without downtime.

**Outbound signature format:**

```
Recurva-Signature: t=1705321380,v1=abc123def456...
```

The timestamp `t` is included in the signed message to prevent replay attacks:

```
signed_payload = "{timestamp}.{json_body}"
signature = HMAC-SHA256(key=signing_secret, message=signed_payload)
```

### 11.3 Customer Portal JWT

```typescript
{
  alg: 'HS256',
  payload: {
    sub: customer_id,
    tenant_id: tenant_id,
    iat: issuedAt,
    exp: issuedAt + 3600  // 1 hour
  }
}
```

**No refresh token.** JWT expiry is 1 hour. Portal re-authenticates via the tenant's own auth system. Recurva issues a new JWT on each `POST /auth/token` call, which the tenant triggers after their own auth check. This keeps Recurva stateless for JWT validation.

**Signing key:** `JWT_SECRET` environment variable; 256-bit random string. Rotation requires redeployment (acceptable for 1-hour tokens).

### 11.4 Environment Variables (Never in Code)

```
DATABASE_URL           — postgres.js connection string
NOMBA_API_KEY          — Nomba merchant API key
NOMBA_WEBHOOK_SECRET   — HMAC secret for Nomba inbound webhooks
JWT_SECRET             — Customer portal JWT signing key
ENCRYPTION_KEY         — AES-256 key for nomba_token field at rest
```

### 11.5 What Is Never Stored

- Raw card numbers (PAN)
- CVV / CVC
- Full card expiry (only month + year for display; not used for charging)
- Nomba API keys belonging to tenants

### 11.6 SQL Injection Prevention

All database queries use postgres.js tagged template literals:

```typescript
// CORRECT
const result = await sql`SELECT * FROM subscriptions WHERE id = ${id} AND tenant_id = ${tenantId}`;

// NEVER do this
const result = await sql.unsafe(`SELECT * FROM subscriptions WHERE id = '${id}'`);
```

postgres.js parameterises values automatically in tagged templates. The `sql.unsafe()` method is banned via ESLint rule. Dynamic column names (e.g., in reporting) use an allowlist of safe column names checked before query construction.

### 11.7 Audit Log Design

Every state-changing operation writes to `audit_logs` **within the same database transaction** as the change. This ensures audit entries cannot be missing for committed changes.

**Logged operations:** All subscription transitions, invoice creation/payment/void, charge attempts, refunds, coupon attachment, payment method changes, webhook endpoint changes, API key creation/revocation.

**Tamper evidence:** `audit_logs.id` is a `BIGSERIAL`. Gaps in the sequence indicate deleted rows. A nightly job verifies sequence continuity and alerts on gaps.

**Retention:** Audit logs are retained for 7 years (Nigerian financial regulation requirement). A scheduled job archives logs older than 2 years to cold storage (object storage), while keeping the last 2 years hot in PostgreSQL.

**PII in audit logs:** Customer email and name are stored only by reference (`customer_id`). The `diff` column stores changed fields but masks sensitive values (e.g., `nomba_token` is replaced with `[REDACTED]`).

---

## 12. Error Handling Standard

### 12.1 Unified Error Response Format

Every error response uses this structure:

```json
{
  "error": {
    "code": "subscription_not_found",
    "message": "No subscription with id 'sub_xyz' exists for this tenant.",
    "request_id": "req_01HZXYZ...",
    "details": []
  }
}
```

### 12.2 Error Code Taxonomy

**Format:** `snake_case`, machine-readable, namespaced by domain.

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_request` | Malformed JSON or missing required fields |
| 400 | `validation_error` | Zod schema validation failed |
| 401 | `authentication_required` | Missing or invalid API key / JWT |
| 401 | `invalid_api_key` | Key not found or revoked |
| 403 | `forbidden` | Key valid but lacks permission for this resource |
| 404 | `resource_not_found` | Generic not found |
| 404 | `customer_not_found` | Specific resource not found |
| 404 | `subscription_not_found` | |
| 404 | `plan_not_found` | |
| 409 | `duplicate_email` | Unique constraint: customer email |
| 409 | `duplicate_code` | Unique constraint: coupon code |
| 409 | `duplicate_idempotency_key` | Usage event already recorded |
| 409 | `plan_has_active_subscriptions` | Cannot delete/modify plan |
| 422 | `coupon_expired` | Coupon past expiry date |
| 422 | `coupon_exhausted` | Coupon max_redemptions reached |
| 422 | `coupon_currency_mismatch` | Fixed coupon currency != subscription currency |
| 422 | `invalid_transition` | State machine transition not allowed |
| 422 | `cannot_refund_more_than_charged` | Refund amount exceeds charge |
| 422 | `subscription_not_past_due` | Dunning action on non-past_due subscription |
| 429 | `rate_limit_exceeded` | Too many requests |
| 500 | `internal_error` | Unexpected server error |
| 502 | `nomba_error` | Nomba API returned unexpected error |
| 503 | `nomba_unavailable` | Nomba unreachable after retries |

### 12.3 Nomba Error Mapping

| Nomba error | Recurva code | HTTP status |
|---|---|---|
| `INVALID_ACCOUNT` | `nomba_account_misconfigured` | 500 |
| `INSUFFICIENT_FUNDS` | (internal: charge failed) | — |
| `CARD_DECLINED` | (internal: charge failed) | — |
| `DUPLICATE_REFERENCE` | (internal: retry with new ref) | — |
| `INVALID_TOKEN` | (internal: payment method invalid) | — |
| Network timeout | `nomba_unavailable` | 503 |

Card decline errors are not exposed directly to the tenant API — they result in subscription state changes and webhook events.

### 12.4 Validation Error Format (Zod)

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "request_id": "req_...",
    "details": [
      {
        "field": "currencies.0.amount",
        "message": "Expected number, received string",
        "code": "invalid_type"
      }
    ]
  }
}
```

### 12.5 Logging Strategy

| Severity | When | Output |
|---|---|---|
| `DEBUG` | SQL queries (dev only), Nomba request/response bodies | stdout (dev) |
| `INFO` | Request received/completed, state transitions, invoice generated | structured JSON to stdout |
| `WARN` | Nomba retry triggered, idempotency key collision, slow query >500ms | structured JSON |
| `ERROR` | Charge failed (business error), Zod parse failure, DB constraint violation | structured JSON + alert |
| `CRITICAL` | Nomba unreachable after retries, DB connection lost, sequence gap in audit log | structured JSON + PagerDuty |

All logs include: `{ timestamp, level, request_id, tenant_id?, resource_type?, resource_id?, message, ...context }`.

---

## 13. Testing Specification

### 13.1 Unit Tests

Every domain function is tested in isolation with no DB or HTTP dependencies.

**Proration math (`src/domain/proration.test.ts`):**
```
- upgrade mid-cycle: verify net_charge = FLOOR(daily_new * D) - FLOOR(daily_old * D)
- downgrade mid-cycle: verify credit = FLOOR(daily_old * D) - FLOOR(daily_new * D)
- cancellation: verify credit = FLOOR(daily_old * D)
- edge: D = 0 (last day of cycle) → net_charge = 0
- edge: D = T (first day) → net_charge = full new amount - full old amount
- rounding: amounts that do not divide evenly (floor, never round up)
```

**Coupon calculation (`src/domain/coupon.test.ts`):**
```
- percentage: 20% of 5000 = 1000; 20% of 1001 = 200 (floor)
- fixed: 1000 off 5000 = 4000; 6000 off 5000 = 0 (floor at 0)
- duration 'once': discount applied on month 1; not on month 2
- duration 'repeating' 3 months: months 1,2,3 discounted; month 4 full price
- duration 'forever': all months discounted
- expired coupon: discount = 0
- currency mismatch: discount = 0
```

**State machine transitions (`src/domain/stateMachine.test.ts`):**
```
- every valid transition in §3.2 produces correct new state and side effects
- every invalid transition throws InvalidTransitionError
- guard conditions tested independently (trial_days = 0, payment_method present, etc.)
```

**Dunning schedule (`src/domain/dunning.test.ts`):**
```
- default schedule produces correct scheduled_at timestamps
- custom schedule from JSON is parsed and applied
- backup card used on day 0 attempt
- backup failure correctly advances to day 1 primary
- self-cure cancels remaining attempts
```

### 13.2 Integration Tests

Tests run against a real PostgreSQL instance (Docker). All Nomba API calls are intercepted with `msw` (Mock Service Worker for Bun).

**Full Nomba API flow (`src/infra/nomba/client.test.ts`):**
```
- successful tokenised charge: mock returns success → invoice marked paid
- card declined: mock returns CARD_DECLINED → dunning initiated
- network timeout: mock delays >10s → retry triggered
- 3 network timeouts: → charge marked failed with nomba_unreachable
- DUPLICATE_REFERENCE: → reference regenerated, retried once, succeeds
```

**Webhook handler (`src/api/nomba-webhook.test.ts`):**
```
- valid signature + charge.success → subscription.renewed
- invalid signature → 401, no state change
- duplicate eventId → 200, no double-processing
- charge.failed → subscription to past_due, dunning created
- checkout.completed → payment_method created, subscription activated
```

### 13.3 End-to-End Tests

Full lifecycle scenarios using the Hono test client (no real network calls):

```
Scenario 1: Happy path subscription
  Create tenant → Create plan → Create customer →
  POST /subscriptions → checkout_url returned →
  Simulate checkout.completed webhook →
  Subscription active → Simulate period_end →
  Renewal invoice generated → charge succeeds →
  Subscription renewed

Scenario 2: Full dunning cycle
  Active subscription → Simulate charge.failed →
  Subscription past_due → Day 0 backup tried → fails →
  Day 1 retry → fails → Day 3 → fails → Day 7 → fails →
  Day 10 → subscription cancelled

Scenario 3: Self-cure
  past_due subscription → Customer adds new card (checkout.completed) →
  Immediate charge with new card → succeeds →
  Subscription active, remaining dunning attempts cancelled

Scenario 4: Upgrade mid-cycle
  Active subscription on Plan A → POST /subscriptions/:id/update-plan →
  Proration invoice generated → charged → subscription on Plan B

Scenario 5: Coupon redemption
  Create coupon (20% off, 3 months) → Attach to subscription →
  Month 1: invoice total = 80% of plan price →
  Month 3: invoice total = 80% →
  Month 4: invoice total = 100% (coupon exhausted)

Scenario 6: Metered billing
  Create metered plan → Create subscription →
  Report 100 units of usage →
  Period end → Invoice = 100 * unit_amount →
  Usage records deleted after invoice created

Scenario 7: Both cards fail
  past_due subscription, backup card exists →
  Day 0: backup fails → Day 1,3,7: primary fails →
  Day 10: subscription cancelled, both cards failed
```

### 13.4 Simulating Time in Tests

The dunning engine and billing scheduler use a **clock abstraction** injected as a dependency:

```typescript
// src/infra/clock.ts
export interface Clock {
  now(): Date;
  advanceTo(date: Date): void; // only available in test mode
}

export const systemClock: Clock = { now: () => new Date() };

// In tests:
const fakeClock = createFakeClock(new Date('2025-01-15T00:00:00Z'));
fakeClock.advanceTo(new Date('2025-01-22T00:00:00Z')); // Jump 7 days
```

The scheduler and dunning engine accept a `clock` parameter. `systemClock` is injected in production via dependency injection at the app entrypoint. `fakeClock` is used in all tests.

This eliminates any need for `setTimeout` in tests and makes tests deterministic and fast.

### 13.5 Test Database Strategy

Each test file gets an isolated schema:

```typescript
// src/test/db.ts
export async function createTestDb(testId: string) {
  const schemaName = `test_${testId}_${Date.now()}`;
  await sql`CREATE SCHEMA ${sql(schemaName)}`;
  await sql`SET search_path TO ${sql(schemaName)}`;
  await runMigrations(sql); // applies full schema
  return sql;
}

export async function dropTestDb(schemaName: string) {
  await sql`DROP SCHEMA ${sql(schemaName)} CASCADE`;
}
```

Each test `beforeAll` creates a schema; `afterAll` drops it. Tests run in parallel without interference. The `BIGSERIAL` on `audit_logs` is schema-scoped, so sequence gaps between test schemas are not false positives.

**Rationale for schema isolation over database-per-test:** Creating a new Postgres schema takes ~5ms; creating a new database takes ~200ms and requires superuser privileges in some hosted environments. Schema isolation is fast, cheap, and compatible with Neon/Supabase/RDS.

---

*End of Recurva Technical Requirements Document v1.0.0*
