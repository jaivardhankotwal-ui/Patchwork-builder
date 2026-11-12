# Patchwork

**incident → evidence → patch**

Patchwork turns a production stack trace into an evidence-backed diagnosis, a proposed code change, and a reviewable GitHub pull request. It combines Sentry-style incident intake, GitHub source and commit history, Gemini analysis, generated regression-test suggestions, and a persistent incident dashboard.

> **Hackathon demo:** the dashboard includes three clearly labeled synthetic crashes (React, Python, and Node.js). “Load into Analyzer” copies a mock trace into the analyzer; it does not send anything to Gemini until you click **Analyze & diagnose incident**. Analysis uses your selected repository and may use AI credits. Mock incidents are not actual production reports.

## Project overview

Patchwork is built for the gap between a production alert and a safe, reviewable fix. Instead of stopping at an explanation, it relates the trace to repository code and recent commits, proposes a focused patch and regression test, and keeps the result attached to an incident record.

The dashboard supports manual stack-trace analysis and a signed Sentry webhook receiver. It stores incidents and diagnosis results in PostgreSQL, streams queue updates to the dashboard, and can send Slack alerts. GitHub writes happen only after a user takes an explicit action.

## Three-stage architecture

### 1. Ingest the incident

- Paste a stack trace into **Section 01 — Ingest incident**, or load one of the three mock traces for a demo.
- Submit a simulated trace or configure Sentry to send signed JSON to `POST /api/webhooks/sentry`.
- The Sentry receiver verifies an HMAC SHA-256 signature over the exact raw request body, stores accepted deliveries in a durable queue, and deduplicates identical signed deliveries.
- Queued events appear in the Active Incidents view and are analyzed in the background. Manual analysis can be started directly from the dashboard.

### 2. Build a diagnosis and regression-test proposal

- The API reads repository source and recent, file-specific Git history through the connected GitHub integration or `GITHUB_TOKEN`.
- Gemini returns a root-cause summary, commit attribution when supported by the available evidence, a proposed patch, and a new regression-test file when a code change is proposed.
- Patch and test paths/content are checked before they are saved. Generated tests and their suggested commands are proposals: Patchwork does **not** execute them or claim they passed.
- The incident, diagnosis, test proposal, elapsed diagnosis time, and notification status are persisted for the dashboard and history.

### 3. Choose draft review or guarded Auto-Merge

**Manual Review** is the default. After confirmation, Patchwork creates a branch, commits the proposed fix and generated test, and opens a GitHub **Draft PR**. A developer reviews the changes and runs tests; Patchwork does not merge or deploy in this mode.

**Autonomous Auto-Merge** is a separate, opt-in action and is limited to the `main` branch. It requires a signed-in user with an explicit, repository-scoped administrator grant. After a confirmation that explains the real GitHub write, Patchwork verifies the saved PR identity and exact proposed files, marks the PR ready for review if needed, and asks GitHub to merge only when GitHub reports a clean, ready, mergeable PR. GitHub branch protections, checks, and reviews remain in force; Patchwork does not bypass them, force-push, or fabricate passing checks.

Auto-Merge’s validation label is **simulated only**: no generated tests are run. A successful diagnosis or generated test is not proof of correctness. Auto-Merge can affect the repository’s `main` branch and may trigger deployments configured by that repository.

## Why Patchwork

- **Incident-first workflow:** coding assistants such as Copilot and Cursor are primarily used while a developer is working in a codebase. Patchwork starts with an incident trace, connects it to source and commit evidence, and keeps the diagnosis, proposed changes, and PR together.
- **Evidence over unsupported attribution:** commit blame is reported only when it matches available history; otherwise attribution is left unidentified.
- **Human review by default:** Manual Review opens a draft PR. Auto-Merge is visibly separate, requires explicit confirmation and trusted repository-level permission, and remains subject to GitHub’s protections.
- **A usable demo without a real outage:** mock traces can be loaded into the analyzer in one click and are clearly identified as synthetic. They are never automatically sent to AI or external services.
- **Fast diagnosis target:** Patchwork measures diagnosis duration and targets approximately **8 seconds** for a hackathon demo. The dashboard’s average is based on recorded diagnosis runs; real times depend on provider latency and repository size. Diagnosis time is not mean time to recovery (MTTR), and it is not a performance guarantee.

## Stack

- React, Vite, TypeScript, Tailwind CSS
- Express 5 API and generated OpenAPI clients
- PostgreSQL with Drizzle ORM
- GitHub REST/GraphQL APIs, through a Replit-managed GitHub connection or `GITHUB_TOKEN`
- Gemini (`GEMINI_API_KEY` or Replit AI Integrations)
- Clerk authentication for the guarded Auto-Merge action
- Signed Sentry webhook intake and optional Slack incoming-webhook alerts

## Quickstart

### Requirements

- Node.js supported by the workspace (Node.js 24 is used in the project environment)
- `pnpm`
- A PostgreSQL database
- A GitHub connection/token with access to the repository you want to analyze
- Gemini access through a Replit AI Integration or an API key

### Install and configure

```sh
pnpm install
```

Add the applicable values using Replit’s **Secrets** tooling (or your trusted local environment). Do not commit secrets:

| Variable | Required for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | API and incident history | PostgreSQL connection string. |
| `GITHUB_TOKEN` | GitHub API access, optional when using the managed connection | If set, it takes precedence over the Replit-managed GitHub connection. Use a token with only the repository permissions needed for source reads and PR/branch writes. |
| `GEMINI_API_KEY` | Gemini analysis, optional when using Replit AI Integrations | Direct Gemini key. Alternatively, configure `AI_INTEGRATIONS_GEMINI_API_KEY` and `AI_INTEGRATIONS_GEMINI_BASE_URL` through the Replit integration. |
| `SENTRY_WEBHOOK_SECRET` | External signed Sentry deliveries | HMAC signing secret used to verify `sentry-hook-signature`. Without it, the external receiver returns `503`. |
| `SLACK_WEBHOOK_URL` | Slack alerts (optional) | Incoming webhook URL. Keep it in Secrets; never paste it into source or chat. |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` | Sign-in and Auto-Merge authorization | Configure Clerk for the app. Sign-up alone does not grant merge access. |

Connect GitHub using the workspace’s Replit integration when available, or provide `GITHUB_TOKEN`. Configure Gemini through Replit AI Integrations or `GEMINI_API_KEY`. If using the Sentry receiver, configure the same signing secret in Sentry and in Replit Secrets, then restart the API workflow.

Push the database schema to a **development** database:

```sh
pnpm --filter @workspace/db run push
```

Start the API and dashboard in separate terminals, or start the configured Replit workflows:

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/patchwork run dev
```

Open the Patchwork web preview. Enter an `owner/repo` and branch, paste a trace or use **Load into Analyzer** on a mock incident, then click **Analyze & diagnose incident**. Review the diagnosis and proposed diff before creating a PR.

### Granting Auto-Merge access

Auto-Merge is unavailable until Clerk is configured and the signed-in user has a repository-specific grant. The workspace operator must independently verify the user, then run this trusted-shell command against the intended Clerk environment:

```sh
pnpm --filter @workspace/api-server run merge-admin -- user_ID owner/repo
```

Use `--revoke` as the final argument to remove that repository’s grant. The CLI requires a verified email and never creates or merges a PR. See [`docs/webhooks.md`](docs/webhooks.md) for the access-control, webhook, Slack, and Auto-Merge details.

## Useful commands

```sh
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/patchwork run typecheck
pnpm --filter @workspace/api-server run test
```

## Safety notes

- A loaded mock trace is synthetic input. Analysis becomes a real provider call only after the user submits it.
- A generated patch or test is untrusted AI output and must be reviewed. Suggested tests are not executed by Patchwork.
- Manual Review produces a Draft PR and does not merge or deploy.
- Auto-Merge is a real GitHub write, not a simulation. It requires an authorized user, fresh confirmation, an eligible `main` PR, exact expected PR contents, and GitHub’s clean mergeable state.
- Signed Sentry verification protects the external receiver; it is not general dashboard authentication. Keep the app and repository data within an appropriately trusted workspace.
