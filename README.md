# Recurva

Subscription billing API built with Bun + Hono + PostgreSQL. Powered by Nomba for card payments.

## Quick Start

```bash
cp .env.example .env
docker compose up
bun run migrate
```

API is live at `http://localhost:3000`. See [docs/quickstart.md](docs/quickstart.md) for the integration guide.

## Architecture

```mermaid
graph TB
    subgraph "Your Infrastructure"
        APP[Your App / Frontend]
    end

    subgraph "Recurva"
        API[API Server<br/>Bun + Hono]
        CRON[Scheduler<br/>In-process cron]
        DB[(PostgreSQL 16)]
        OUTWH[Outbound Webhooks<br/>HMAC-signed POST]
        INWH[Inbound Webhooks<br/>HMAC-verified POST]
    end

    subgraph "Nomba"
        NOMBA[Nomba API<br/>Card processing]
    end

    APP -- HTTP/JSON --> API
    API --> DB
    CRON --> API
    API --> OUTWH
    INWH --> API
    API -- Checkout / Charge / Refund --> NOMBA
    NOMBA -- Payment callbacks --> INWH

    style API fill:#4a9,color:#fff
    style DB fill:#69c,color:#fff
    style NOMBA fill:#c96,color:#fff
```

### Components

| Component | Tech | Purpose |
|-----------|------|---------|
| API Server | Bun + Hono | REST API + webhooks |
| Database | PostgreSQL 16 | All persistence |
| Scheduler | In-process cron | Billing, dunning, webhook delivery |
| Payment Gateway | Nomba | Card tokenisation, charging, refunds |
| Outbound Webhooks | HMAC-signed POST | Event notifications to your app |
| Inbound Webhooks | HMAC-verified POST | Nomba payment callbacks |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `DATABASE_URL` | `postgresql://recurva:recurva@localhost:5432/recurva` | PostgreSQL connection |
| `JWT_SECRET` | *(required)* | Key for signing JWTs (64+ hex chars) |
| `ENCRYPTION_KEY` | *(required)* | AES-256-GCM key (32 hex chars) |
| `NOMBA_ENV` | `test` | Nomba environment (`test` \| `live`) |
| `NOMBA_PARENT_ACCOUNT_ID` | *(required)* | Nomba parent account ID |
| `NOMBA_SUB_ACCOUNT_ID` | *(required)* | Nomba sub-account ID |
| `NOMBA_TEST_CLIENT_ID` | *(required for test)* | Nomba sandbox client ID |
| `NOMBA_TEST_PRIVATE_KEY` | *(required for test)* | Nomba sandbox private key |
| `NOMBA_LIVE_CLIENT_ID` | *(required for live)* | Nomba live client ID |
| `NOMBA_LIVE_PRIVATE_KEY` | *(required for live)* | Nomba live private key |
| `NOMBA_INBOUND_WEBHOOK_SECRET` | *(required)* | Key to verify Nomba → Recurva webhooks |
| `BILLING_CRON` | `0 6 * * *` | Daily billing time (UTC) |
| `LOG_LEVEL` | `info` | Log verbosity |

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
- **Inbound Webhooks** — Nomba charge/refund event handlers (`POST /webhooks/nomba`)

## Deployment

### Branch Strategy

| Branch | Auto-deploys to | URL |
|--------|----------------|-----|
| `dev` | — | — |
| `staging` | Dev server | `https://dev.recurva.xyz` |
| `main` | Production | `https://recurva.xyz` |

Merge `dev → staging → main`. CI runs tests + migrations on each push.

### Infrastructure

| Server | IP | Domain |
|--------|----|--------|
| Production | `129.80.235.169` | `recurva.xyz` |
| Development | `157.151.216.152` | `dev.recurva.xyz` |

Both run on Oracle Cloud Free Tier (Ubuntu 22.04, Docker, nginx + Let's Encrypt SSL).

## Development

```bash
bun install
bun run dev          # hot-reload dev server
bun run migrate      # run pending migrations
bun test             # run unit + integration tests
bun run typecheck    # TypeScript type checking
```

## Documentation

| Doc | Description |
|-----|-------------|
| [API Reference](docs/api-reference.md) | All endpoints, request/response schemas, error codes |
| [Quickstart](docs/quickstart.md) | Integration guide |
| [Postman Collection](docs/recurva.postman_collection.json) | Import for interactive testing |
| [Nomba Guide](nomba.md) | Payment processor integration details |
| [Architecture](docs/recurva_architecture.md) | System design |
| [Server Setup](docs/recurva-server.md) | Infrastructure handover |

## License

MIT
