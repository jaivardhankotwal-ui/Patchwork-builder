# Patchwork: draft PRs, Slack and Sentry

## Human verification

In a diagnosis card, **Open Draft PR on GitHub (Human Verification Guardrail)** asks for confirmation before writing to GitHub.

Patchwork reads the latest base-branch SHA, checks the diagnosed source still matches the target file, creates a `patchwork/fix-<short-commit-sha>-<timestamp>` branch, commits the proposed file, and opens a draft PR. The base is the incident's configured branch, not a hardcoded `main`.

If the target file changed, re-analyze first. Older diagnoses can proceed only if their saved patch can be reversed unambiguously and the complete reconstructed original exactly matches the current file; otherwise re-analyze. Empty or inconsistent patches are rejected. The same incident returns its existing PR instead of creating duplicates; interrupted operations reuse their stored branch.

The incident becomes **Draft PR Opened** and retains its GitHub link across reloads. This is an unresolved incident, not a deployed fix. Marking it resolved is a separate manual action.

The connected GitHub account must have permission to create branches and pull requests in the target repository. `GITHUB_TOKEN`, when configured in Secrets, takes precedence over the managed GitHub connection.

## Slack

Add the incoming webhook URL as **SLACK_WEBHOOK_URL** using the project's Secrets tooling. Do not paste it into chat or source control.

Patchwork automatically sends Block Kit alerts after a diagnosis and again after a draft PR is created. **Send to Slack** retries or sends manually. The diagnosis card reports sent, failed or unconfigured delivery; a Slack failure does not discard the incident or PR.

Alerts include timing, error/file, suspected author and commit, root cause and the draft PR review link when one exists. Before PR creation, the alert explicitly says no draft PR exists. Drafts are never described as tested or ready to merge.

## Signed Sentry receiver

Endpoint: `POST /api/webhooks/sentry` on the application's domain.

Add **SENTRY_WEBHOOK_SECRET** in Secrets, using the signing secret from the Sentry integration. The receiver requires the **sentry-hook-signature** header: a hexadecimal HMAC SHA256 digest of the exact raw JSON body, computed using that secret. Re-serializing the body after signing invalidates its signature.

Without the secret, the external receiver returns **503**. Missing or invalid signatures return **401**. Invalid payloads return **400**.

Normalized payload:

```json
{
  "repository": "owner/repo",
  "branch": "main",
  "stack_trace": "TypeError: Cannot read properties of undefined\n    at handler (/app/src/handler.js:42:12)"
}
```

Native Sentry event payloads under `data.event`, `event`, or `data.issue.event` are also accepted when they contain `exception.values[].stacktrace.frames`.

Repository selection is explicit:

1. Payload `repository` / `branch`
2. Event tags `github.repository` / `github.branch`
3. Server configuration `SENTRY_REPOSITORY` / `SENTRY_BRANCH`

The default branch is `main`. There is no default repository. An issue-only payload without an exception event or stack trace is rejected rather than inventing crash evidence.

Valid deliveries return **202** with a persisted job. Identical signed bodies return the same job, preventing duplicate incidents on delivery retries. Jobs survive restarts. The dashboard's **Webhook activity** reports queued, processing, completed or failed, with a diagnosis link or actionable error.

Dashboard changes are pushed over `GET /api/events` (Server-Sent Events); periodic list refreshes provide a fallback and support multiple server instances.

## Dashboard simulation

1. Choose a repository and branch.
2. Use **Simulate Sentry webhook** to fill a synthetic trace using an existing source path, or paste a trace.
3. Click **Send simulated webhook & diagnose**.

This uses `POST /api/webhooks/sentry/simulate`, which submits a **simulated** incident into the same durable queue without weakening the signed external receiver. It uses AI credits and may send a Slack alert if configured. It never automatically creates a PR.

## Access-control boundary

The current application is a shared dashboard without user authentication. Before public publishing, protect the dashboard and its internal action/simulation endpoints with sign-in and repository authorization. Sentry signature verification only protects the external receiver; it is not user access control for the rest of the app.
