# Contributing to Recurva

## Branch Strategy

| Branch | Purpose | Auto-deploys To | URL |
|--------|---------|----------------|-----|
| `dev` | Active development (default) | — | — |
| `staging` | Pre-production validation | Dev server | `dev.recurva.xyz` |
| `main` | Production releases | Production | `recurva.xyz` |

### Workflow

```
feat/RCV-XXX  ──PR──▶  dev  ──merge──▶  staging  ──merge──▶  main
```

1. Create a feature branch from `dev`:
   ```bash
   git checkout dev
   git checkout -b feat/RCV-XXX-description
   ```
2. Commit changes with descriptive messages.
3. Open a pull request targeting `dev`.
4. After review/CI passes, merge into `dev`.
5. To deploy to staging: merge `dev` into `staging` → CI auto-deploys to `dev.recurva.xyz`.
6. To release to production: merge `staging` into `main` → CI auto-deploys to `recurva.xyz`.

> Never commit directly to `staging` or `main`. All changes flow through `dev` first.

## Commit Messages

Use conventional commits:

```
feat: add tenant creation endpoint
fix: correct proration calculation for mid-cycle changes
chore: update dependencies
test: add state machine transition tests
docs: update API reference
```

## Code Style

- **Runtime:** Bun
- **Framework:** Hono
- **Database:** postgres.js with camelCase transforms
- **Validation:** Zod (via @hono/zod-validator)
- **Testing:** Bun Test (`bun test`)
- **Language:** TypeScript (strict mode)
- **Money:** All amounts in kobo/smallest currency unit (integers, never floats)

## PR Checklist

- [ ] Code compiles: `bun run typecheck`
- [ ] Tests pass: `bun test`
- [ ] Follows existing code conventions
- [ ] No secrets, credentials, or tokens committed
- [ ] Branch targets the correct base (`dev`)
- [ ] PR description references the issue number (e.g. `Closes RCV-XXX`)

## Getting Started

```bash
git clone git@github.com:Brownie44l1/recurva.git
cd recurva
bun install
cp .env.example .env
docker compose up -d
bun run migrate
bun run dev
```

## Environment

See `.env` for all required variables. Never commit `.env` files. Secrets are injected via GitHub Actions secrets (`TEST_JWT_SECRET`, `TEST_NOMBA_WEBHOOK_SECRET`) in CI.
