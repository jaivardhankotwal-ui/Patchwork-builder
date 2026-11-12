# Patchwork

Production incident diagnosis using GitHub source/commit history and Gemini, with reviewable patches and PostgreSQL incident history.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/patchwork` — React dashboard.
- `artifacts/api-server/src/lib/diagnose.ts` — source context, Gemini diagnosis, patch validation.
- `artifacts/api-server/src/lib/github.ts` — managed connector or explicit token access.
- `lib/api-spec/openapi.yaml` — API contract; regenerate clients after changes.
- `lib/db/src/schema/incidents.ts` — persisted incident records.

## Architecture decisions

- PR creation is an explicit action. Manual Review defaults to draft-only. Opt-in Autonomous Auto-Merge requires separate confirmation, a generated regression test, `main` as base, a matching SHA-pinned PR and GitHub's clean mergeable state. Validation is simulated only; never fabricate passing CI, bypass protections, force-push or directly deploy. The current base-file content must match the diagnosis snapshot.
- The dashboard remains shared, but real Auto-Merge requires a Clerk session and an exact repository administrator grant from trusted backend metadata. Signups never self-promote. Only the workspace operator can grant/revoke access using `merge-admin`; see `docs/webhooks.md`. Further restrict private incident reads before public exposure.
- Under 60 seconds is a target, dependent on provider latency and source size, not a guarantee.
- Slack alerts run after diagnosis and PR actions, using the confirmed draft/open/merged outcome; delivery failures are persisted separately and never discard a diagnosis or PR.
- External Sentry webhooks require raw-body HMAC SHA256 verification with `SENTRY_WEBHOOK_SECRET`. A durable database queue processes accepted deliveries and deduplicates identical signed bodies.
- See `docs/webhooks.md` for receiver payloads, Slack setup and safe simulation.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
