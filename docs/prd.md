# Recurva — Product Requirements Document

**Version:** 1.0  
**Status:** Draft  
**Author:** Recurva Engineering  
**Last Updated:** June 2026  
**Audience:** Technical evaluators, product reviewers, hackathon judges

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals and Non-Goals](#3-goals-and-non-goals)
4. [Target Users](#4-target-users)
5. [User Stories](#5-user-stories)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Success Metrics](#8-success-metrics)
9. [Constraints](#9-constraints)
10. [Feature Roadmap](#10-feature-roadmap)

---

## 1. Executive Summary

Recurva is a multi-tenant subscription billing engine built on top of Nomba's payment APIs, purpose-built for the Nigerian market. It gives SaaS founders and product teams a complete managed billing layer — including plan management, dunning, proration, metered billing, and customer self-serve — without requiring them to build any of it themselves. Recurva sits between a business and Nomba the way Stripe Billing sits between a business and Stripe: it manages the lifecycle, the logic, and the recovery, while the payment rails underneath remain Nomba's.

**Core problem solved:** Every Nigerian SaaS team that needs recurring billing must either bolt together a fragile in-house scheduler, or use Stripe Billing which doesn't support NGN natively, doesn't handle local payment methods, and was designed around Western banking behaviour. Recurva closes this gap entirely.

**Who it is for:**

- **Primary:** Nigerian SaaS founders and product teams who need recurring billing without rebuilding it from scratch for every product.
- **Secondary:** Their end customers — subscribers who need a clean, trustworthy subscription management experience in naira.
- **Tertiary:** Developers integrating Recurva's REST API directly into their own products or platforms.

---

## 2. Problem Statement

### 2.1 Why Recurring Billing Is Hard to Build in the Nigerian Context

Recurring billing sounds simple on paper: charge a customer every month. In practice, it requires a billing engine that handles subscription state machines, billing cycles, grace periods, proration on plan changes, dunning sequences tuned to customer behaviour, multiple payment method fallback, metered usage aggregation, idempotent charge execution, and webhook delivery with retry logic. A naïve implementation misses most of these. A production-quality implementation takes months.

In Nigeria specifically, these challenges are compounded:

- **Card retry behaviour is unpredictable.** Cards fail for reasons that are often temporary — insufficient balance at billing time, card throttling by the issuing bank, network timeouts. Retrying immediately often fails again. Retrying at specific times (e.g., a few days after month-end salary credit) significantly improves recovery.
- **Salary cycles matter.** A large percentage of Nigerian salaried workers receive salaries between the 25th and 5th of the following month. A dunning engine that retries on day 2 after failure and stops on day 5 will recover far fewer subscriptions than one tuned to retry around salary arrival.
- **Card tokenization and charge-on-file** work differently across Nigerian card schemes and require Nomba-specific integration logic.
- **Multi-currency support for NGN** is absent or unreliable in global tools. Plans priced in naira need to store, display, and process amounts correctly without FX conversion noise.

### 2.2 What Nomba Provides vs. What Is Missing

Nomba provides world-class payment primitives:

- Card tokenization (save customer cards for future charges)
- Charge-on-file (charge a saved card without customer re-entry)
- Payment verification and webhook events
- Hosted checkout pages

What Nomba does not provide is a managed billing layer. Nomba doesn't know what a "subscription" is. It doesn't know what a "plan" is. It doesn't retry failed charges on a schedule. It doesn't calculate proration when a customer upgrades mid-cycle. It doesn't send dunning emails. It doesn't track MRR. These are Recurva's job.

### 2.3 Why Existing Global Solutions Don't Work

| Problem | Stripe Billing | Recurva |
|---|---|---|
| NGN as primary currency | NGN not supported as settlement currency | NGN first-class |
| Nomba payment methods | Not supported | Native |
| Local dunning patterns | Tuned for US/EU banking behaviour | Tuned for Nigerian salary cycles |
| FX overhead | All charges convert to USD then back | No FX conversion |
| Nomba checkout UX | Not available | Native integration |
| Pricing | USD-denominated, expensive for early stage NGN businesses | Flat rate in NGN |

Stripe Billing, Chargebee, and similar tools are designed for markets where card infrastructure is mature, FX is stable, and customers respond to email dunning within 24 hours. None of these assumptions hold consistently in Nigeria.

### 2.4 The Cost of Every Team Rebuilding This

A conservative estimate of what it costs a Nigerian SaaS team to build a production-quality billing engine from scratch:

- **2–3 months of senior engineer time** to build the core billing loop, dunning, and proration
- **1 month of QA** to catch the edge cases that cause double charges, missed renewals, and incorrect proration
- **Ongoing maintenance** every time Nomba updates their API, or when a new card scheme quirk is discovered
- **Operational incidents** from the billing engine failing silently at 3 AM

Recurva replaces all of this with a single API integration and a hosted dashboard, available in days rather than months.

---

## 3. Goals and Non-Goals

### 3.1 Goals

- Provide a complete subscription billing lifecycle engine — from plan creation to dunning recovery — built on top of Nomba's payment APIs.
- Support multiple tenants, each with their own Nomba credentials (sandbox and production), their own plans, their own customers, and their own billing configuration.
- Expose a clean REST API that any developer can integrate in hours, with predictable errors, idempotency support, and full documentation.
- Provide a web dashboard that allows non-technical founders to manage plans, customers, subscriptions, coupons, and view analytics without writing code.
- Provide a hosted checkout page and customer self-serve portal so end customers can subscribe, update their payment method, and manage their subscription without the tenant building any UI.
- Execute billing reliably — zero double charges, correct proration, recoverable dunning — even under failures, retries, and race conditions.
- Support metered billing with tenant-reported usage aggregated into invoices.
- Deliver webhook events to tenant applications for every significant billing event.
- Track and expose MRR, churn, and dunning recovery analytics per tenant.
- Be deployable on a single Oracle VPS and tuned for Nigerian market conditions.

### 3.2 Non-Goals

Recurva explicitly does not:

- **Process payments directly.** Recurva is not a payment processor. All card charging goes through Nomba's APIs. Recurva never holds funds.
- **Compete with Nomba.** Recurva is built on top of Nomba and exists to expand Nomba's utility, not replace it.
- **Handle one-time payments as a primary feature.** Recurva is designed for recurring subscriptions. A one-time invoice can be generated, but one-time payment orchestration is not a supported workflow.
- **Store raw card data.** Card numbers, CVVs, and expiry dates are never stored in Recurva's database. All card data is handled exclusively by Nomba.
- **Send transactional email directly.** Recurva fires webhooks. Tenants are responsible for sending emails to their customers using their own email infrastructure.
- **Support non-Nomba payment processors** in v1. There is no Paystack, Flutterwave, or bank transfer integration in v1.
- **Calculate or remit taxes.** VAT, WHT, and other tax obligations are out of scope for v1.
- **Provide accounting software integration** (QuickBooks, Sage, etc.) in v1.

---

## 4. Target Users

### Persona 1: The Nigerian SaaS Founder

**Who they are:** A founder running a B2B or B2C SaaS product in Nigeria. Their product is live and has paying customers. They are either charging manually today (bank transfer, one-time Paystack links) or they have a fragile recurring billing setup bolted together with cron jobs and prayer.

**What they're building:** A SaaS product with monthly or annual subscription plans. Possibly multiple tiers (Starter, Growth, Pro). Possibly metered billing for API calls or seats. They want to offer coupons during launches, upgrade/downgrade paths, and some customers on annual contracts.

**Their billing pain today:**
- Manually chasing failed payments over WhatsApp.
- No visibility into which customers are about to churn because their card failed.
- No proration — they either absorb the cost of upgrades or charge customers awkward amounts.
- No self-serve for customers — every plan change requires a support ticket.
- MRR tracked on a spreadsheet updated by hand.

**What they need from Recurva:** A dashboard where they can set up plans once, and then the system handles renewals, failures, retries, upgrades, downgrades, and reporting automatically. They want to see MRR at a glance. They want to know which customers are in dunning. They want to offer a 3-month discount to new customers without writing code.

**Technical level:** Comfortable with SaaS products. Not necessarily a developer. Should not need to understand webhooks or idempotency keys to use Recurva.

---

### Persona 2: The Developer Integrating Recurva

**Who they are:** A backend or full-stack engineer at a Nigerian startup, or a freelance developer building billing infrastructure for a client. They evaluate APIs the way they evaluate any technical dependency: documentation quality, error consistency, latency, idempotency support, and how much they have to trust the system to do the right thing.

**What they need from an API:**
- A consistent REST API with predictable request/response shapes and HTTP status codes that map to real error conditions.
- Idempotency key support on all mutating endpoints so retries don't create duplicates.
- Webhook events with signed payloads they can verify.
- A sandbox mode that mirrors production behaviour without charging real cards.
- SDK or Postman collection so they're not writing raw HTTP from scratch.
- Clear API reference documentation with example requests and responses for every endpoint.

**What good DX means to them:**
- Errors that tell them what went wrong and how to fix it, not just `"status": "error"`.
- An endpoint that does what it says and nothing surprising.
- Webhook events that carry enough context that they don't need to make a follow-up API call to handle the event.
- A changelog so they know when the API changes.

**Their fear:** Integrating a billing system that double-charges customers, misses renewals silently, or changes behaviour without notice.

---

### Persona 3: The End Customer (Subscriber)

**Who they are:** A customer of a business that uses Recurva. They might be a startup founder paying for a B2B tool, or an individual paying for a consumer SaaS subscription. They interact with Recurva through the tenant's product — they don't know Recurva exists.

**What they expect from a subscription experience:**
- A clean checkout page where they can pay with their card once and trust it to renew automatically.
- An email or in-app notification when their payment fails — not a surprise cancellation.
- The ability to update their card without calling support.
- The ability to cancel their subscription themselves without having to send a WhatsApp message.
- A receipt or invoice they can download for expense reimbursement.

**What makes them churn:**
- A failed card that cancels their subscription without warning or retry.
- No way to update their payment method — they have to contact support.
- A confusing upgrade experience where they're charged an amount they don't understand.
- A subscription that's difficult to cancel — dark patterns erode trust permanently.

---

## 5. User Stories

### 5.1 Tenant Onboarding and Nomba Credential Setup

- As a SaaS founder, I want to create a Recurva account and add my Nomba API keys so that Recurva can start processing payments through my Nomba account.
- As a founder, I want to configure separate sandbox and production Nomba credentials so that I can test billing flows without touching real customer cards.
- As a developer, I want to generate multiple API keys for my Recurva tenant so that I can use separate keys for different environments or internal services without sharing a single credential.
- As a founder, I want to receive an alert if my Nomba credentials are revoked or return authentication errors so that I can fix the issue before billing fails.
- As a developer, I want to rotate my Recurva API key and have a grace period where both old and new keys work so that I can rotate credentials without downtime.

### 5.2 Plan Management

- As a founder, I want to create a monthly subscription plan priced in NGN so that my customers can subscribe and be billed automatically each month.
- As a founder, I want to create both fixed-price plans and metered plans (billed per unit of usage) so that I can offer usage-based billing to API-heavy customers.
- As a founder, I want to create annual plans with a discount compared to monthly so that I can incentivize customers to commit to longer terms.
- As a developer, I want to create and update plans via the API so that my product can programmatically manage billing tiers without using the dashboard.
- As a founder, I want to archive a plan so that no new customers can subscribe to it but existing subscribers continue on it unchanged.
- As a founder, I want to set a trial period on a plan so that new subscribers get a defined number of free days before their first charge.

### 5.3 Coupon and Discount Code Management

- As a founder, I want to create a percentage-off coupon code so that I can offer a launch discount that customers apply at checkout.
- As a founder, I want to create a fixed-amount coupon (e.g., ₦2,000 off) so that I can run targeted discount campaigns.
- As a founder, I want to set an expiry date and a redemption limit on a coupon so that I can run time-limited promotions without manually deactivating them.
- As a founder, I want to restrict a coupon to first-time subscribers only so that existing customers cannot retroactively apply a new-customer discount.
- As a developer, I want to validate a coupon code via the API before showing the discounted price at checkout so that customers see the correct amount before entering their card.
- As a founder, I want to see a report of how many times each coupon has been redeemed so that I can measure the ROI of each promotion.

### 5.4 Customer Subscription Lifecycle

- As a developer, I want to create a customer record via the API and attach a subscription to a plan so that I can programmatically onboard a paying user.
- As a founder, I want to see a list of all active subscriptions with their status, next billing date, and plan so that I can monitor my subscriber base at a glance.
- As a customer, I want to upgrade my subscription to a higher tier mid-cycle so that I can access premium features immediately without waiting for my next billing date.
- As a customer, I want to downgrade my subscription and have the new lower price take effect at the end of my current billing period so that I'm not charged twice for the same period.
- As a founder, I want to manually cancel a customer's subscription from the dashboard so that I can handle refund and cancellation requests without API access.
- As a developer, I want to pause a subscription for a defined number of billing cycles so that I can offer payment holidays to customers without cancelling their account.

### 5.5 Multiple Payment Methods and Backup Card Management

- As a customer, I want to save multiple cards to my account so that I have a fallback if my primary card fails.
- As a customer, I want to designate one card as my primary payment method and another as a backup so that billing is attempted in the order I prefer.
- As a developer, I want to initiate a card-save flow via the Nomba hosted checkout so that the customer's card is tokenized and stored without Recurva handling raw card data.
- As a founder, I want to see which customers have only one saved payment method so that I can proactively prompt them to add a backup before their next billing date.
- As a customer, I want to remove a saved card from my account so that I can keep my payment methods clean.

### 5.6 Payment Success and Failure Handling

- As a developer, I want to receive a `subscription.payment.succeeded` webhook event when a renewal charge succeeds so that I can update my product's access state and send a receipt email.
- As a founder, I want to see a clear invoice generated for every successful charge, including the amount, plan, billing period, and any applied discounts, so that customers and I both have a record.
- As a developer, I want to receive a `subscription.payment.failed` webhook event with the reason code when a charge fails so that I can notify the customer and trigger an in-product warning.
- As a founder, I want failed payments to move the subscription to a `past_due` state rather than immediately cancelling so that there is time to recover the payment before the customer loses access.
- As a developer, I want all charge attempts to be idempotent so that if my server retries a billing trigger, the customer is never charged twice for the same invoice.

### 5.7 Dunning and Smart Recovery

- As a founder, I want Recurva to automatically retry a failed charge on a configurable schedule so that transient card failures recover without manual intervention.
- As a founder, I want the default dunning schedule to account for Nigerian salary cycles (retry around the 1st–5th of the month) so that recovery rates are higher than a generic retry strategy.
- As a founder, I want a subscription to move to `cancelled` state after all dunning retries are exhausted so that I am not indefinitely retrying a card that will never succeed.
- As a developer, I want to receive webhook events at each dunning retry attempt so that I can send escalating in-product prompts to the customer to update their card.
- As a founder, I want to configure how many dunning retry attempts are made before cancellation so that I can tune aggressiveness per product context.
- As a developer, I want Recurva to automatically attempt the backup card if the primary card fails on the first dunning attempt so that a card failure does not always start the dunning clock.

### 5.8 Proration on Plan Changes

- As a customer, I want to upgrade to a higher-tier plan mid-cycle and be charged only the prorated difference for the remaining days in my billing period so that I am not overcharged.
- As a customer, I want to downgrade to a lower-tier plan mid-cycle and receive a prorated credit toward my next invoice so that I am not paying for service I won't use.
- As a developer, I want to preview the proration amount before confirming a plan change via the API so that I can show the customer exactly what they will be charged or credited before they confirm.
- As a founder, I want all proration calculations to be logged with the before-state, after-state, formula used, and resulting amount so that I can audit any disputed charge.

### 5.9 Metered Usage Reporting and Billing

- As a developer, I want to report usage events to Recurva via the API throughout the billing period so that metered customers are charged based on actual consumption.
- As a developer, I want to report usage with an idempotency key so that if my service retries the usage report, the unit is not counted twice.
- As a founder, I want to see total reported usage per customer per billing cycle in the dashboard so that I can verify that metered invoices are correct before they go out.
- As a developer, I want to query the current usage total for a subscription mid-cycle via the API so that I can show customers their current usage and projected bill in my product.
- As a founder, I want metered usage to be aggregated using a `sum` strategy by default so that each reported unit adds to the total for the billing period.

### 5.10 Customer Self-Serve Portal

- As a customer, I want to access a hosted portal where I can see my current plan, next billing date, and billing history so that I have full visibility without contacting support.
- As a customer, I want to update my primary and backup payment methods from the self-serve portal so that I can fix a failing card without sending a support ticket.
- As a customer, I want to cancel my subscription from the self-serve portal so that I am in control of my own billing without dark patterns.
- As a founder, I want to embed a link to the customer self-serve portal in my product so that customers can access it without me building any UI.
- As a customer, I want to download a PDF invoice for any past payment from the self-serve portal so that I can submit it for expense reimbursement.

### 5.11 Webhook Configuration and Management

- As a developer, I want to register one or more webhook endpoint URLs per tenant so that Recurva sends billing events to my application.
- As a developer, I want every webhook payload to include a signature I can verify using a shared secret so that I can reject spoofed webhook deliveries.
- As a developer, I want failed webhook deliveries to be retried with exponential backoff for up to 72 hours so that transient downtime in my server does not cause me to miss events.
- As a developer, I want to see a log of all webhook delivery attempts per event — including timestamp, HTTP status code, and response body — so that I can debug delivery failures.
- As a developer, I want to manually retry a specific webhook event from the dashboard so that I can reprocess an event I failed to handle correctly.
- As a developer, I want to filter which event types are sent to each webhook endpoint so that I can send payment events to one service and subscription state events to another.

### 5.12 Reporting, MRR Tracking, and Churn Analytics

- As a founder, I want to see my current MRR and how it has changed month-over-month so that I know whether my business is growing.
- As a founder, I want to see a breakdown of new MRR, expansion MRR (upgrades), contraction MRR (downgrades), and churned MRR for each month so that I can diagnose where MRR is coming from and where it is leaking.
- As a founder, I want to see a list of customers who churned this month and the reason (cancelled vs. payment failure) so that I can identify patterns and take action.
- As a founder, I want to see my dunning recovery rate — the percentage of past-due subscriptions that recover successfully — so that I can evaluate whether my retry schedule is effective.
- As a founder, I want to export my billing data (invoices, subscriptions, customers) as a CSV so that I can import it into my accounting tool or investor dashboard.

---

## 6. Functional Requirements

### 6.1 Tenant Management

| ID | Requirement |
|---|---|
| TM-01 | The system must allow a user to register a tenant account with a name, email address, and password. The password must be hashed using bcrypt with a cost factor of 12 or higher before storage. |
| TM-02 | Each tenant must have a unique tenant ID that namespaces all resources (plans, customers, subscriptions) belonging to that tenant. |
| TM-03 | A tenant must be able to store one set of Nomba sandbox credentials and one set of Nomba production credentials. Credentials are stored encrypted at rest using AES-256. |
| TM-04 | A tenant must be able to toggle between sandbox mode and production mode. In sandbox mode, all Nomba API calls are routed to Nomba's sandbox endpoints. |
| TM-05 | A tenant must be able to generate up to 5 API keys. Each API key is displayed to the tenant exactly once at creation time and cannot be retrieved again. The system stores only the bcrypt hash of the key. |
| TM-06 | A tenant must be able to revoke an API key, which immediately prevents any further API calls authenticated with that key. |
| TM-07 | The system must log all tenant credential changes (Nomba key update, mode toggle) with timestamp, actor, and the previous value (masked). |

### 6.2 Plan Management

| ID | Requirement |
|---|---|
| PL-01 | A tenant must be able to create a plan with: name, description, amount (in the smallest currency unit, e.g., kobo for NGN), currency (ISO 4217), billing interval (daily, weekly, monthly, annually), trial period in days (0 = no trial), and plan type (fixed or metered). |
| PL-02 | For metered plans, the tenant must specify a per-unit price in the smallest currency unit and the unit name (e.g., "API calls"). |
| PL-03 | Plan amounts must be stored and processed as integers (kobo for NGN) to avoid floating-point precision errors. |
| PL-04 | A tenant must be able to archive a plan. Archived plans cannot have new subscriptions created against them. Existing subscriptions on archived plans continue unchanged. |
| PL-05 | A tenant must be able to update a plan's name and description. Changing the price or interval of an existing plan is not allowed — the tenant must create a new plan and migrate customers if desired. |
| PL-06 | The API must return all plans belonging to the authenticated tenant, filterable by status (active, archived) and plan type (fixed, metered). |

### 6.3 Coupon and Discount Engine

| ID | Requirement |
|---|---|
| CP-01 | A tenant must be able to create a coupon with: a code (case-insensitive, unique per tenant), discount type (percentage or fixed amount), discount value, currency (for fixed-amount coupons), optional expiry timestamp, optional maximum redemption count, and optional restriction to first-time subscribers only. |
| CP-02 | Applying a coupon code must be validated against: expiry date, redemption count, new-subscriber restriction, and currency match (for fixed-amount coupons). Validation failures must return a specific error code per failure reason. |
| CP-03 | When a coupon is applied to a subscription, the discount must be applied to every invoice for that subscription for the duration of the coupon. Recurva must track whether a coupon is one-time (applies to first invoice only), multi-use (applies for N invoices), or forever. |
| CP-04 | The system must increment a coupon's `times_redeemed` counter atomically when it is applied to a subscription. |
| CP-05 | The API must provide a coupon validation endpoint that returns the discount amount that would be applied to a given plan, given a coupon code, without actually applying it. |
| CP-06 | A tenant must be able to deactivate a coupon, preventing further use without deleting it. Subscriptions already using the coupon are unaffected. |

### 6.4 Customer Management

| ID | Requirement |
|---|---|
| CU-01 | A tenant must be able to create a customer record with: an external ID (the tenant's own user ID), email address, full name, and optional phone number. The external ID must be unique per tenant. |
| CU-02 | Customer records must be logically deletable. A deleted customer's subscriptions must move to cancelled state and no further billing must occur. |
| CU-03 | The API must support retrieving a customer by either Recurva customer ID or external ID. |
| CU-04 | The system must prevent creating duplicate customers with the same external ID within the same tenant. The response must include the existing customer record and a `409 Conflict` status. |

### 6.5 Payment Method Management

| ID | Requirement |
|---|---|
| PM-01 | Recurva must support saving customer payment methods via Nomba's hosted checkout. Recurva initiates a Nomba checkout session in save-card mode, and upon successful completion, stores the returned card token, card scheme, masked PAN (last 4 digits), and expiry month/year. Raw card data must never be stored. |
| PM-02 | Each customer can have a maximum of 5 saved payment methods. |
| PM-03 | Each customer must have exactly one payment method designated as primary. Attempting to delete the primary method when it is the only saved method must return an error. |
| PM-04 | A customer must be able to designate a secondary payment method as their backup. The billing engine must attempt the primary method first and the backup method if the primary fails on the first attempt. |
| PM-05 | A tenant or customer must be able to delete a payment method. Deleting the primary method when a backup exists must automatically promote the backup to primary. |
| PM-06 | The API must return payment methods with the card token redacted. The response must include: Recurva payment method ID, card scheme, last 4 digits, expiry, and is_primary / is_backup flags. |

### 6.6 Subscription Lifecycle

| ID | Requirement |
|---|---|
| SL-01 | A subscription must exist in exactly one of these states at any time: `trialing`, `active`, `past_due`, `paused`, `cancelled`. Invalid state transitions must be rejected with a `422 Unprocessable Entity` error and must not be persisted. |
| SL-02 | Valid state transitions are: `trialing → active` (trial ends, first charge succeeds), `trialing → past_due` (trial ends, first charge fails), `active → past_due` (renewal charge fails), `past_due → active` (dunning recovery succeeds), `past_due → cancelled` (dunning exhausted), `active → cancelled` (explicit cancellation), `active → paused` (pause requested), `paused → active` (resume requested or pause period ends). |
| SL-03 | Creating a subscription against a plan with a trial period must set the state to `trialing` and schedule the first billing attempt at trial end, not at creation time. |
| SL-04 | Cancelling a subscription must set the `cancelled_at` timestamp and the effective cancellation date. Cancellation must support two modes: `immediately` (access ends now) and `end_of_period` (access continues until the end of the current billing period). |
| SL-05 | Pausing a subscription must accept a `pause_until` date. On that date, the scheduler must automatically resume the subscription and charge for the next billing period. |
| SL-06 | Every subscription state change must be recorded in the `subscription_events` table with: event type, previous state, new state, timestamp, and actor (system or API key ID). |

### 6.7 Billing and Invoice Engine

| ID | Requirement |
|---|---|
| BI-01 | The billing engine must generate an invoice before attempting any charge. An invoice must capture: tenant ID, customer ID, subscription ID, billing period start and end, line items (plan charge, usage charges, discounts, credits), total amount in kobo, currency, and status (draft, open, paid, void, uncollectible). |
| BI-02 | The billing engine must execute charges with idempotency. Each invoice must have a unique idempotency key derived deterministically from the subscription ID and billing period. The engine must check whether a successful charge already exists for this idempotency key before initiating a new Nomba charge. |
| BI-03 | A successful Nomba charge must transition the invoice to `paid` status and the subscription to `active` status within the same database transaction. |
| BI-04 | A failed Nomba charge must transition the invoice to `open` status and the subscription to `past_due` status. The failure reason code from Nomba must be stored on the invoice. |
| BI-05 | Invoices must never be deleted. Voiding an invoice sets status to `void` and records the reason. |
| BI-06 | The API must allow a tenant to retrieve all invoices for a subscription or for a customer, paginated with cursor-based pagination. |

### 6.8 Metered Usage Engine

| ID | Requirement |
|---|---|
| MU-01 | The API must expose a usage reporting endpoint that accepts: subscription ID, quantity, and idempotency key. The endpoint must be idempotent — submitting the same idempotency key twice must return the original record and a `200 OK`, not a duplicate record. |
| MU-02 | Usage records must be summed over the current billing period when generating a metered invoice. The sum must include all usage records with a timestamp within the billing period `[period_start, period_end)`. |
| MU-03 | The API must expose an endpoint to retrieve the current usage total for a subscription in the active billing period. |
| MU-04 | Usage records must be immutable once created. Corrections must be submitted as a new record with a negative quantity. The usage report endpoint must accept negative quantities. |
| MU-05 | At the end of a billing period, the metered invoice line item must reflect the sum of all usage records for that period multiplied by the per-unit price. If usage is zero, the invoice line item must be ₦0 (not omitted). |

### 6.9 Dunning and Recovery Engine

| ID | Requirement |
|---|---|
| DN-01 | When a renewal charge fails, the dunning engine must schedule retry attempts according to the tenant's configured dunning schedule. The default schedule is: retry on day 3, retry on day 5, retry on day 8, retry on day 27 (targeting the end-of-month salary credit window), and final attempt on day 30. |
| DN-02 | On the first charge failure, if the customer has a backup payment method, the dunning engine must immediately attempt the backup card before starting the dunning clock. If the backup card succeeds, no dunning schedule is started. |
| DN-03 | Each dunning retry attempt must be executed with the same idempotency key as the original invoice, preventing double-charges if the scheduler fires twice. |
| DN-04 | After the final dunning retry fails, the subscription must transition to `cancelled` state. The `cancelled_reason` field must be set to `dunning_exhausted`. |
| DN-05 | A tenant must be able to configure the number of dunning attempts (minimum 1, maximum 8) and the delay in days between each attempt. Custom schedules must be validated to ensure no two retries are scheduled for the same day. |
| DN-06 | The dunning engine must fire a `subscription.dunning.attempt` webhook event on each retry attempt, including the attempt number, the payment method used, the outcome, and the next scheduled retry date (or null if exhausted). |

### 6.10 Proration Engine

| ID | Requirement |
|---|---|
| PR-01 | When a customer upgrades to a higher-priced plan mid-cycle, the system must calculate a prorated charge for the remaining days on the new plan and a prorated credit for the unused days on the old plan. The net amount (charge minus credit) must be invoiced immediately. |
| PR-02 | When a customer downgrades to a lower-priced plan mid-cycle, the system must calculate a prorated credit for the unused days on the old plan. This credit must be applied to the next invoice, not refunded. |
| PR-03 | The proration formula must be: `proration_amount = daily_rate × remaining_days`, where `daily_rate = plan_amount / days_in_billing_period` and `remaining_days = days from change date to period end, inclusive`. |
| PR-04 | The API must expose a proration preview endpoint that accepts the current subscription ID and target plan ID, and returns the calculated proration amount and the breakdown of the calculation, without making any changes. |
| PR-05 | All proration calculations must be logged with: subscription ID, old plan, new plan, change date, billing period, daily rate, remaining days, and resulting amount. This log must be queryable per subscription. |
| PR-06 | Proration amounts must be calculated and stored as integers in the smallest currency unit (kobo). Fractional kobo must be rounded down. |

### 6.11 Nomba Integration Layer

| ID | Requirement |
|---|---|
| NB-01 | All Nomba API calls must use the tenant's configured credentials for that environment (sandbox or production). Credentials must not be shared between tenants. |
| NB-02 | The Nomba integration layer must wrap all API calls with retry logic: up to 3 retries on network timeout or 5xx errors, with exponential backoff starting at 500ms. |
| NB-03 | Nomba API responses must be logged (excluding card data) with: tenant ID, request type, request timestamp, response HTTP status, Nomba transaction reference, and outcome. |
| NB-04 | The integration layer must support initiating a Nomba hosted checkout session in two modes: card-save (no charge) and charge (charge a saved card token). |
| NB-05 | When a Nomba API call returns an authentication error (401), the system must immediately flag the tenant's credentials as invalid and fire a `tenant.credentials.invalid` webhook event to the tenant's registered endpoint. Further billing for that tenant must be suspended until credentials are updated. |

### 6.12 Inbound Webhook Handler (from Nomba)

| ID | Requirement |
|---|---|
| IW-01 | Recurva must expose a public endpoint to receive inbound webhook events from Nomba (e.g., payment confirmations, card save confirmations). |
| IW-02 | Every inbound Nomba webhook must be verified against Nomba's signature before being processed. Events failing signature verification must return `401 Unauthorized` and must not be processed. |
| IW-03 | Inbound webhooks must be processed idempotently. Processing the same Nomba event ID twice must not create duplicate records or double charges. |
| IW-04 | Inbound webhook processing must be asynchronous. The HTTP response to Nomba must return `200 OK` within 5 seconds. Actual event processing must happen in a background job queue. |
| IW-05 | All inbound webhook events must be stored in an `inbound_webhook_events` table with: event ID, source, event type, raw payload, received timestamp, and processing status (pending, processed, failed). |

### 6.13 Outbound Webhook System (to Tenant Apps)

| ID | Requirement |
|---|---|
| OW-01 | A tenant must be able to register up to 3 webhook endpoint URLs. Each endpoint must specify which event types it subscribes to. |
| OW-02 | Every outbound webhook payload must include: `event_id` (UUID), `event_type`, `tenant_id`, `created_at` (ISO 8601 UTC), and a `data` object containing the full relevant resource. |
| OW-03 | Every outbound webhook must be signed using HMAC-SHA256 with the tenant's webhook secret. The signature must be included in the `X-Recurva-Signature` header as `sha256=<hex>`. |
| OW-04 | Failed webhook deliveries (non-2xx response or timeout) must be retried with exponential backoff: after 30s, 5m, 30m, 2h, 8h, 24h, and 48h. After 7 failed attempts, the delivery is marked as permanently failed. |
| OW-05 | All webhook delivery attempts must be logged with: delivery attempt ID, event ID, endpoint URL, attempt timestamp, HTTP status code, response body (truncated to 1KB), and delivery status. |
| OW-06 | The dashboard must expose a webhook event log showing the last 100 events per endpoint with the ability to manually retry any event from within the last 72 hours. |
| OW-07 | The system must fire outbound webhook events for the following event types (minimum): `subscription.created`, `subscription.activated`, `subscription.renewed`, `subscription.payment.succeeded`, `subscription.payment.failed`, `subscription.dunning.attempt`, `subscription.cancelled`, `subscription.paused`, `subscription.resumed`, `invoice.created`, `invoice.paid`, `invoice.voided`, `customer.created`, `customer.deleted`, `tenant.credentials.invalid`. |

### 6.14 Customer Self-Serve Portal

| ID | Requirement |
|---|---|
| CS-01 | Recurva must provide a hosted self-serve portal accessible via a unique URL per tenant (e.g., `https://portal.recurva.io/{tenant-slug}`). |
| CS-02 | Customers must authenticate to the portal via a magic link sent to their email address. No password is required. |
| CS-03 | The portal must display: current subscription plan, billing status, next billing date, billing history (last 12 invoices), and saved payment methods. |
| CS-04 | Customers must be able to add a new payment method by initiating a Nomba hosted checkout session from within the portal. |
| CS-05 | Customers must be able to set their primary and backup payment methods from the portal. |
| CS-06 | Customers must be able to cancel their subscription from the portal. The portal must display a confirmation screen before cancellation. Cancellation must use the `end_of_period` mode by default. |
| CS-07 | Customers must be able to download a PDF invoice for any past payment from the portal. |
| CS-08 | The portal must be mobile-responsive and render correctly on screen widths from 375px upward. |

### 6.15 Tenant Dashboard

| ID | Requirement |
|---|---|
| TD-01 | The dashboard must be accessible at a unique URL per tenant after login, and must require authentication. |
| TD-02 | The dashboard home screen must display: current MRR, active subscriber count, past-due subscriber count, and month-to-date new subscriptions and cancellations. |
| TD-03 | The dashboard must provide a plans page where plans can be created, viewed, and archived. |
| TD-04 | The dashboard must provide a customers page showing all customers with their subscription status, plan, and last payment date. Customers must be searchable by name and email. |
| TD-05 | The dashboard must provide a subscriptions page showing all subscriptions filterable by status (`active`, `past_due`, `trialing`, `paused`, `cancelled`). |
| TD-06 | The dashboard must provide a coupons page where coupons can be created, deactivated, and their redemption counts viewed. |
| TD-07 | The dashboard must provide a webhooks page where endpoints are configured, event logs are viewable, and failed deliveries can be manually retried. |
| TD-08 | The dashboard must provide a settings page where Nomba credentials are configured, environment mode is toggled, and API keys are managed. |

### 6.16 Reporting and Analytics

| ID | Requirement |
|---|---|
| RP-01 | The system must calculate and store MRR at the end of each calendar day. MRR is defined as the sum of all active subscription amounts normalized to a monthly value (annual plans divided by 12, weekly plans multiplied by 4.33). |
| RP-02 | The dashboard must display an MRR chart covering the last 12 months, broken down into: new MRR (new subscriptions), expansion MRR (upgrades), contraction MRR (downgrades), and churn MRR (cancellations). |
| RP-03 | The system must calculate and expose a churn rate per tenant per month, defined as: `(subscriptions cancelled in month / active subscriptions at start of month) × 100`. |
| RP-04 | The system must calculate and expose a dunning recovery rate per tenant, defined as: `(past_due subscriptions that returned to active within 30 days / total subscriptions that entered past_due) × 100`. |
| RP-05 | The API must expose a `/reports/mrr` endpoint and a `/reports/churn` endpoint returning monthly time-series data for the last 12 months. |
| RP-06 | The dashboard must support CSV export of: all invoices, all subscriptions, and all customers, each downloadable as a separate CSV file. |

---

## 7. Non-Functional Requirements

### 7.1 Security

- **API key storage:** API keys must never be stored in plaintext. The full key is shown once at creation. Only the bcrypt hash is stored. On authentication, the submitted key is hashed and compared to the stored hash.
- **Webhook signature verification:** All outbound webhooks are signed with HMAC-SHA256. All inbound Nomba webhooks are verified against Nomba's signature before processing. Events failing verification are rejected and logged.
- **No raw card data stored:** Recurva's database must never contain card numbers, CVVs, or full expiry dates. Card handling is exclusively Nomba's responsibility. Recurva stores only the Nomba-issued card token, masked PAN (last 4 digits), card scheme, and expiry month/year.
- **SQL injection prevention:** All database queries must use parameterized statements or a type-safe query builder. Raw string interpolation into SQL must not appear anywhere in the codebase.
- **Nomba credentials at rest:** Nomba API keys stored per tenant must be encrypted at rest using AES-256-GCM with a master encryption key stored in an environment variable, not in the database.
- **HTTPS enforcement:** All Recurva endpoints must be served over HTTPS. HTTP requests must be redirected to HTTPS with `301 Moved Permanently`.
- **Rate limiting:** API endpoints must enforce rate limits per API key: 100 requests per minute for standard endpoints, 20 requests per minute for mutation endpoints. Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header.

### 7.2 Reliability

- **Idempotency:** All billing-critical mutation endpoints (create subscription, charge invoice, report usage) must support idempotency keys via the `Idempotency-Key` header. Duplicate requests with the same key within 24 hours must return the original response without re-executing side effects.
- **Webhook delivery guarantee:** Outbound webhooks must be delivered at least once. The retry schedule ensures delivery survives multi-hour outages on the tenant's server.
- **Scheduler resilience:** The billing scheduler must be designed so that missing a scheduled run (server restart, crash) and running it late still produces correct results. Invoices use deterministic idempotency keys, so late runs do not double-charge.
- **Database transactions:** Subscription state changes and invoice creation must occur within a single database transaction. Partial state (subscription updated but invoice not created) must not be possible.
- **Background job durability:** All async jobs (billing, webhook delivery, dunning) must be stored in a persistent job queue backed by the database, not in memory. A server restart must not lose queued jobs.

### 7.3 Scalability

- **Multi-tenant isolation:** All database queries must be scoped to the authenticated tenant. Cross-tenant data leakage must be architecturally impossible — every table has a `tenant_id` column and every query includes `WHERE tenant_id = ?`.
- **Database indexing:** The following indexes must be present at minimum: `subscriptions(tenant_id, status)`, `subscriptions(next_billing_date)`, `invoices(subscription_id)`, `invoice_idempotency(key)`, `usage_records(subscription_id, billing_period)`, `webhook_deliveries(event_id, status)`.
- **Connection pooling:** Database connections must use a connection pool with a maximum of 20 connections. The pool configuration must be tunable via environment variable.
- **Pagination:** All list endpoints must return paginated results using cursor-based pagination. Default page size is 20; maximum is 100.

### 7.4 Auditability

- Every billing event (invoice created, charge attempted, state transition, dunning retry, webhook delivery) must be stored in append-only event log tables with: event ID, tenant ID, timestamp (UTC), actor (system scheduler or API key ID), resource type, resource ID, event type, and a JSON blob containing the relevant before/after state.
- Audit log entries must never be deleted or updated. Corrections must be new entries referencing the original event.
- The audit log must be queryable per tenant via the API, filtered by resource type and time range.

### 7.5 Developer Experience

- **Consistent error format:** All API errors must return a JSON body with: `error.code` (machine-readable, e.g., `plan_not_found`), `error.message` (human-readable), and `error.details` (optional, array of field-level validation errors).
- **HTTP status codes:** 400 for validation errors, 401 for authentication failures, 403 for authorization failures, 404 for resource not found, 409 for conflicts, 422 for invalid state transitions, 429 for rate limiting, 500 for internal errors.
- **API documentation:** A full OpenAPI 3.0 specification must be published covering every endpoint, request shape, response shape, and error code.
- **Postman collection:** A Postman collection must be available that covers all major API flows (onboard tenant, create plan, create customer, subscribe, charge, upgrade, cancel) with environment variables pre-wired for sandbox use.
- **Sandbox parity:** Sandbox mode must mirror production behaviour exactly, including webhook events, dunning scheduling, and state transitions.

### 7.6 Nigerian Market Fit

- **NGN as primary currency:** All plan amounts are denominated in NGN by default. All amounts are stored and processed in kobo (100 kobo = ₦1). Display formatting must correctly render naira amounts with the ₦ symbol and comma separators (₦10,500.00).
- **Dunning timing tuned to salary cycles:** The default dunning schedule is calibrated around Nigerian salary patterns — specifically, the final retry is scheduled on day 27 to align with end-of-month salary credits. Tenants can customize this schedule.
- **Nomba checkout as native experience:** The hosted checkout page and customer portal use Nomba's checkout where possible, providing a payment experience that Nigerian customers already recognise and trust.
- **Timezone handling:** All scheduled operations (billing, dunning) are executed in WAT (West Africa Time, UTC+1). All timestamps are stored in UTC and displayed to tenants in WAT.

---

## 8. Success Metrics

| Metric | Definition | Target |
|---|---|---|
| Zero double-charges | No customer is charged more than once for the same invoice across any billing run, retry, or scheduler replay | 0 double-charges per billing cycle, verified by idempotency key uniqueness constraint |
| Dunning recovery rate | Percentage of past-due subscriptions that recover to active within 30 days | Measurable per tenant; system records enough data to calculate this at any time |
| Webhook delivery success rate | Percentage of outbound webhook events that receive a 2xx response on first or subsequent attempt within 72 hours | ≥ 99% of deliveries succeed within 72 hours |
| Proration calculation accuracy | Prorated amounts match hand-calculated expected values for all test cases | 100% match in automated test suite (0 pence/kobo off) |
| API error clarity | All 4xx API errors return a structured error body with a machine-readable `error.code` and a human-readable `error.message` | 100% of 4xx responses include both fields |
| Subscription state machine correctness | No subscription exists in an invalid state; no invalid transition is persisted | 0 invalid state records; integration test suite covers all defined transitions and asserts rejection of invalid ones |
| Billing scheduler accuracy | Subscriptions with a `next_billing_date` in the past are processed within 5 minutes of the scheduled time | ≥ 99% of billing jobs run within 5 minutes of scheduled time |
| API key authentication security | No API key is retrievable in plaintext after the initial creation response | 0 plaintext keys in database; verified by DB snapshot audit |

---

## 9. Constraints

- **Timeline:** v1 is built by a single developer in 7 calendar days. Every feature in the functional requirements above must either be fully implemented or explicitly descoped with documentation.
- **Payment processing:** Recurva must use Nomba APIs exclusively for all card tokenization and charging. No other payment processor (Paystack, Flutterwave, Interswitch) is integrated in v1.
- **Infrastructure:** The full system (API, dashboard, portal, scheduler, job queue, database) must be deployable on a single Oracle VPS (OCI Always Free or equivalent). Horizontal scaling and distributed architecture are not required in v1.
- **Multi-environment credentials:** Each tenant must be able to configure independent Nomba sandbox and production credentials. Sandbox charges must never reach Nomba's production environment and vice versa.
- **No third-party billing libraries:** Recurva's billing engine must be built from scratch against Nomba's APIs, not by wrapping an existing billing library (Stripe, Lago, etc.).

---

## 10. Feature Roadmap

The following features are designed and documented but descoped from v1. They are listed here so that the API and data model can be designed without blocking their future addition.

### v1.1 — Subscription Schedules (Phased Billing)

Allows a tenant to configure a subscription that automatically changes plans on a defined schedule — for example, free for 30 days, then Starter, then auto-upgrades to Growth after 90 days. Requires a `subscription_schedule` resource and a scheduler that processes phase transitions.

### v1.2 — USSD and Bank Transfer as Subscription Payment Methods

Integrates Nomba's USSD and bank transfer APIs as payment methods for subscriptions. This is more complex than card billing because these methods are asynchronous — the customer initiates a transfer, and Recurva must listen for the settlement webhook before advancing the invoice to paid. Requires dedicated dunning logic for bank transfer (different timeout windows).

### v1.3 — Complex Metering Aggregation Strategies

v1 supports only `sum` aggregation for metered billing. v1.3 adds:
- `max` — bill for the highest usage value recorded in the period (suited for seat-based billing)
- `last_value` — bill for the most recent usage report submitted before period end (suited for storage billing)
- `count` — count the number of usage events regardless of quantity

### v1.4 — Tax Calculation

Integrates with a tax calculation engine (or provides a manual tax configuration) to add VAT line items to invoices. For Nigerian businesses, this means 7.5% VAT on applicable transactions. Tax amounts are tracked separately from subscription charges and included in invoice PDFs.

### v1.5 — Embeddable JavaScript Widget

A drop-in JavaScript snippet that tenants can add to any webpage to render an embedded Recurva checkout experience — plan selection, coupon input, and Nomba payment — without redirecting customers to the hosted checkout page. The widget communicates with the Recurva API and Nomba checkout via postMessage. Requires a dedicated CORS configuration and iframe sandboxing policy.

---

*This document is authoritative for the v1 scope of Recurva. All functional requirements are testable as written. Any deviation from this document during implementation must be logged as a known gap with a rationale.*
