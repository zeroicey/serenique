# Repository Guidelines

## Project Structure & Module Organization

Serenique is a monorepo: `services/api` is the Bun + Hono + Drizzle REST API, with modules in `src/modules/*` and migrations in `drizzle/`; `services/mcp` exposes API services as MCP tools; `apps/web` is React + Vite, with features in `src/features/*` and shared UI in `src/components`; `apps/cli` is the Go Cobra CLI.

## Project Memory

Project memory lives in `.ai/`. Before subsystem changes, read the latest relevant notes under `.ai/architecture`, `.ai/decisions`, `.ai/requirements`, `.ai/issues`, and `.ai/worklog`. Save dated Markdown when work creates reusable requirements, architecture, deployment results, non-obvious bugs, tradeoffs, or risks. Use the matching category, include scope/evidence/commands/next steps, and never store secrets.

## Codex Multi-Agent Workflow

Codex reuses Claude Code's six agent prompts as the canonical role specs; do not create `.codex/agents`. For parallel domain work, the Codex main session is captain: read `.claude/agents/README.md` and relevant `*-agent.md` files (`api`, `mcp`, `cli`, `web`, `deploy`, `flutter`), then paste/adapt those constraints into Codex subagent briefs. Keep write scopes disjoint, lock the `services/api` contract first, then integrate and verify in main.

## Build, Test, and Development Commands

```sh
bun install
bun run typecheck
bun run test
bun run --cwd apps/web dev
bun run --cwd apps/web build
bun run --cwd services/api dev
```

API DB tests run from `services/api` with `bun run test:integration:full`. CLI checks run from `apps/cli`: `make build`, `make test`, `go vet ./...`.

## Coding Style & Naming Conventions

TypeScript uses strict mode and `@/*` aliases. Follow the API skeleton: `*.schema.ts`, `*.types.ts`, `*.domain.ts`, `*.mappers.ts`, `*.service.ts`, `*.handler.ts`, `*.router.ts`. Keep pure rules in `*.domain.ts` and row conversion in `*.mappers.ts`. Web code uses ESLint, Prettier, hooks rules, and Tailwind. Go code should stay idiomatic `gofmt`/`go vet`.

## Testing Guidelines

Use `*.test.ts`, `*.test.tsx`, and Go `*_test.go` naming. API unit tests run with `cd services/api && bun test`; DB integration tests are gated by `RUN_DB_TESTS=1`. Web tests use Vitest with jsdom and Testing Library. Add focused tests near changed code.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit-style messages such as `feat(web): ...`, `fix(docker): ...`, and `docs(ai): ...`. Use practical scopes: `api`, `mcp`, `web`, `cli`, `docker`, or `ai`. PRs should include summary, subsystem, tests, context link, and screenshots for web changes.

## Security & Configuration Tips

Do not commit secrets. Use root `.env` for Docker Compose runtime config and `.env.example` for documented variables. Deployment details are in `docs/deployment.md`; verify live state before redeploying.
