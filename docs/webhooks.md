# Patchwork: PR autonomy, Slack and Sentry

## Human verification

In a diagnosis card, **Open Draft PR on GitHub (Human Verification Guardrail)** asks for confirmation before writing to GitHub.

Patchwork reads the latest base-branch SHA, checks the diagnosed source still matches the target file, creates a `patchwork/fix-<short-commit-sha>-<timestamp>` branch, commits the proposed file, and opens a draft PR. The base is the incident's configured branch, not a hardcoded `main`.

If the target file changed, re-analyze first. Older diagnoses can proceed only if their saved patch can be reversed unambiguously and the complete reconstructed original exactly matches the current file; otherwise re-analyze. Empty or inconsistent patches are rejected. The same incident returns its existing PR instead of creating duplicates; interrupted operations reuse their stored branch.

New diagnoses also generate a regression test for the crash edge case, using repository test conventions when available. The **Regression test** tab beside **Code diff** shows its complete content, proposed path, rationale, and suggested run command. Neither the test nor its command is automatically executed. Review imports, dependencies and assertions, and verify that it fails before the fix and passes afterward.

New draft PRs for these diagnoses include both the patched source and a new test file (in separate retry-safe commits). Existing files at the generated test path are never overwritten; if the base path already exists, re-analyze. Interrupted operations reuse identical generated files on the patch branch and reject conflicting content. Older diagnoses without tests remain readable; re-analyze to generate a test. Manual Review reuses an existing PR without changing its code or readiness.

The incident becomes **Draft PR Created** and retains its GitHub link across reloads. This is an unresolved incident, not a deployed fix. Marking it resolved is a separate manual action.

The connected GitHub account must have permission to create branches and pull requests in the target repository. `GITHUB_TOKEN`, when configured in Secrets, takes precedence over the managed GitHub connection.

## Opt-in Autonomous Auto-Merge

Section 01's **Autonomy Level** defaults to **Manual Review (Draft PR)** on every page load. Selecting **Autonomous Auto-Merge** does not trigger a write or merge by itself; it changes the explicit action in the selected diagnosis card. Webhooks and diagnosis completion never create or merge PRs automatically.

The Auto-Merge action requires confirmation describing the repository, `main` target, real merge consequences, potential repository deployment triggers, and **SIMULATED ONLY — tests NOT executed** validation. Synthetic incidents still write real GitHub changes if confirmed.

`POST /api/incidents/:id/create-pr` accepts `{ "mode": "manual" }` (also the default for an empty/omitted body) or `{ "mode": "auto_merge", "confirm_auto_merge": true }`. Auto-Merge requires the incident to target `main` and include a generated regression test. It initially creates a draft containing the fix and test, verifies the PR identity and exact two-file contents at a pinned head SHA, updates the report, and uses GitHub's GraphQL `markPullRequestReadyForReview` mutation when necessary. It requests `PUT /repos/{owner}/{repo}/pulls/{number}/merge` only if GitHub reports a clean, ready, mergeable PR.

No real test is executed and **no passing GitHub check/status is fabricated**. Required CI, approvals and other protections must be satisfied independently; pending/unknown states, conflicts or blocked reviews stop the merge. No rules are changed, bypass flags sent, or force pushes performed. A repository that disables merge commits must be handled manually.

The API saves the PR URL before attempting the merge and returns a persisted `pr_outcome` with live state (`draft`, `open`, `closed`, `merged`, or `unknown`), requested mode, validation label, error, and confirmed merge SHA. The ledger displays **Auto-Merged to main** only on confirmed GitHub success, counts merged incidents with resolved records, and retains the validation caveat. Slack uses the actual PR outcome.

Blocked or failed attempts retain the PR link and describe the problem; a draft marked ready is shown as **PR Open · Not Merged**, not mislabeled draft. A lost merge response is reconciled with one read, never an automatic second merge request. Explicit retries reuse the saved branch/PR, with a per-incident database lock preventing concurrent attempts. **Refresh GitHub status** is a read-only reconciliation action and does not merge. PR state reflects the last reconciliation, not continuous GitHub monitoring.

### Merge administrator access

Auto-Merge is protected server-side by Clerk session authentication and a repository-specific administrator grant in trusted Clerk public metadata. Signing up alone never grants permission. Anonymous requests return **401 before database/GitHub access**; signed-in users without a grant return **403 before any GitHub write**. The API does not allow cross-origin browser writes. Manual draft creation and the existing shared dashboard remain available as before; keep private repository data in a trusted workspace.

Sign in through **Admin sign in** in the navbar. In Auto-Merge mode, an unauthorized diagnosis card shows your account ID. The workspace operator must independently verify the account owner, then run this operator-only command in the trusted workspace shell:

```sh
pnpm --filter @workspace/api-server run merge-admin -- user_ID owner/repo
```

Use `--revoke` as the final argument to remove that repository's grant. The CLI requires a verified email, preserves unrelated grants/metadata, and never creates or merges a PR. It must be run against the intended environment's Clerk instance; development and production identities are separate. There is no public role-editing endpoint or first-signup administrator promotion.

The card checks access for its saved incident repository (not the editable form field), and the server rechecks the current grant before every Auto-Merge attempt. Permission lookup failures fail closed. Use the workspace Auth pane to manage sign-in providers; all browser authentication uses Clerk's session cookies.

## Slack

Add the incoming webhook URL as **SLACK_WEBHOOK_URL** using the project's Secrets tooling. Do not paste it into chat or source control.

Patchwork automatically sends Block Kit alerts after a diagnosis and again after a draft PR is created. **Send to Slack** retries or sends manually. The diagnosis card reports sent, failed or unconfigured delivery; a Slack failure does not discard the incident or PR.

Alerts include timing, error/file, suspected author and commit, root cause and the draft PR review link when one exists. Before PR creation, the alert explicitly says no draft PR exists. Drafts are never described as tested or ready to merge.

## Signed Sentry receiver

Endpoint: `POST /api/webhooks/sentry` on the application's domain.

Open **Sentry settings** in the dashboard to copy the endpoint and check configuration status. Add **SENTRY_WEBHOOK_SECRET** in Replit's secure Secrets input, using the signing secret from the Sentry integration, then restart the API workflow. The unauthenticated dashboard deliberately does not expose a secret-editing endpoint; otherwise any visitor could replace the receiver's signing secret.

The receiver requires the **sentry-hook-signature** header: a hexadecimal HMAC SHA256 digest of the exact raw JSON body, computed using that secret. Re-serializing the body after signing invalidates its signature.

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

Valid deliveries return **202** with a persisted job. Identical signed bodies return the same job, preventing duplicate incidents on delivery retries. Jobs survive restarts. The dashboard's **Active Incidents queue** shows the received stack trace and reports queued, processing, completed or failed, with a diagnosis link or actionable error.

Dashboard changes are pushed over `GET /api/events` (Server-Sent Events); periodic list refreshes provide a fallback and support multiple server instances.

## Dashboard simulation

1. Choose a repository and branch.
2. Use **Simulate Sentry webhook** to fill a synthetic trace using an existing source path, or paste a trace.
3. Click **Send simulated webhook & diagnose**.

This uses `POST /api/webhooks/sentry/simulate`, which submits a **simulated** incident into the same durable queue without weakening the signed external receiver. It uses AI credits and may send a Slack alert if configured. It never automatically creates a PR.

## Access-control boundary

The current application is a shared dashboard without user authentication. Before public publishing, protect the dashboard and its internal action/simulation endpoints with sign-in and repository authorization. Sentry signature verification only protects the external receiver; it is not user access control for the rest of the app.
