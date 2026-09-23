# Contributing to VerifyOS

Thanks for your interest! This document gets you from clone to first PR.

## Development setup

```bash
# requirements: Node ≥ 20, pnpm (corepack enable), Docker (optional)
git clone https://github.com/KrabWW/verifyos.git
cd verifyos
pnpm install

# configure your LLM (writes .env, git-ignored)
bash scripts/setup-llm.sh

# infra: PostgreSQL / Redis / MinIO via docker compose
pnpm infra          # stop with: pnpm infra:down
# …or just use bash start.sh, which manages a local PostgreSQL for you
```

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | run all workspaces in watch mode |
| `pnpm build` | build all workspaces |
| `pnpm typecheck` | TypeScript check across the monorepo |
| `pnpm --filter @verifyos/server dev` | run a single workspace |
| `pnpm check:events` | validate shared event contracts |

## Guidelines

- **Commits**: conventional style — `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`
- **Before pushing**: `pnpm typecheck` must pass; add/adjust tests when behavior changes
- **Secrets**: never commit `.env`, API keys, or tokens. `.env` is git-ignored; templates belong in `.env.example` with empty values
- **Docs**: user-facing docs live in `docs/`; historical working notes in `docs/internal/`
- **AI subsystem**: keep the no-key degradation path working — every AI capability must run (degraded) without an LLM

## Pull requests

1. Fork / branch from `main`
2. Keep PRs small and focused; describe the scenario and how to verify it
3. Include screenshots or evidence for UI changes
4. Link related issues
