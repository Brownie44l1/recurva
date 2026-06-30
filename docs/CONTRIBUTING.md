# Contributing to Recurva

## Branch Strategy

| Branch | Purpose | Deploys To |
|--------|---------|------------|
| `main` | Production-ready code | `recurva.xyz` |
| `staging` | Pre-production validation | — |
| `dev` | Active development | `dev.recurva.xyz` |
| `feat/RCV-NNN-slug` | Per-issue feature branches | — |

### Workflow

1. Branch from `dev`: `git checkout dev && git checkout -b feat/RCV-XXX-description`
2. Commit changes with descriptive messages.
3. Open a pull request targeting `dev`.
4. After review, merge into `dev`.
5. Periodically merge `dev` into `staging` for pre-release validation.
6. Merge `staging` into `main` for production releases.

## Issue Tracking

- All work is tracked via GitHub Issues.
- Branch convention: `feat/RCV-NNN-slug` (e.g. `feat/RCV-001-repo-init`).
- Label conventions: `epic:[name]` + `type:[feat|chore|test|fix|docs]`.

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
git clone git@github.com:anomalyco/recurva.git
cd recurva
bun install
cp .env.example .env
docker compose up -d     # starts app + PostgreSQL
bun run migrate           # apply database migrations
bun run dev               # hot-reload dev server
```

## Environment

See `.env.example` for all required variables. Never commit `.env` files.
