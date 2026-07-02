# Recurva

Subscription billing API built with Bun + Hono + PostgreSQL.

## Quick Start

```bash
cp .env.example .env
docker compose up
bun run migrate
```

API is live at `http://localhost:3000`. See [docs/quickstart.md](docs/quickstart.md) for the 10-minute integration guide.

## Architecture

```
┌─────────────┐  HTTP/JSON   ┌──────────────────┐
│   Your App   │─────────────▶│   Recurva API     │
│  (Frontend)  │◀─────────────│  (Bun + Hono)     │
└─────────────┘              └────────┬─────────┘
                                      │
                         ┌────────────┴────────────┐
                         │    PostgreSQL 16         │
                         │  (subscriptions, plans,  │
                         │   invoices, customers)   │
                         └─────────────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │    Nomba (PG)            │
                         │  (Card processing)       │
                         └─────────────────────────┘
```

### Components

| Component | Tech | Purpose |
|-----------|------|---------|
| API Server | Bun + Hono | REST API + webhooks |
| Database | PostgreSQL 16 | All persistence |
| Scheduler | In-process cron | Billing, dunning, webhook delivery |
| Payment Gateway | Nomba | Card tokenisation, charging, refunds |
| Outbound Webhooks | HMAC-signed POST | Event notifications to your app |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `DATABASE_URL` | `postgresql://recurva:recurva@localhost:5432/recurva` | PostgreSQL connection |
| `JWT_SECRET` | `dev-secret...` | Key for signing JWTs |
| `NOMBA_SANDBOX_SECRET` | `""` | Nomba sandbox API secret |
| `NOMBA_LIVE_SECRET` | `""` | Nomba live API secret |
| `BILLING_CRON` | `0 6 * * *` | Daily billing time (UTC) |
| `LOG_LEVEL` | `info` | Log verbosity |

## Documentation

| Doc | Description |
|-----|-------------|
| [API Reference](docs/api-reference.md) | All endpoints, request/response schemas, error codes |
| [Quickstart](docs/quickstart.md) | 10-minute integration guide |
| [Postman Collection](docs/recurva.postman_collection.json) | Import for interactive testing |
| [Issues Backlog](docs/recurva-github-issues.md) | Full project plan |

## API Endpoints (Overview)

- **Tenants** — Register, manage API keys
- **Plans** — Create, list, update, archive
- **Coupons** — Discount codes with percentage/fixed, duration limits
- **Customers** — Create, update, soft-delete
- **Payment Methods** — Tokenised cards, primary/backup designation
- **Subscriptions** — Create, cancel, pause, resume, change-plan (with proration)
- **Usage** — Metered billing ingestion and aggregation
- **Invoices** — List, void, retry charges
- **Webhooks** — Register endpoints, delivery history, manual retry
- **Portal** — Customer self-serve (magic-link auth, subscription management)
- **Dashboard** — Admin auth, MRR/churn metrics, dunning metrics
- **Reports** — Revenue, cohorts, CLV, dunning outcomes, reconciliation
- **Inbound Webhooks** — Nomba charge/refund event handlers

## Development

```bash
bun install
bun run dev          # hot-reload dev server
bun run migrate      # run pending migrations
bun test             # run unit + integration tests
```

## License

MIT
