import { test } from "node:test";
import assert from "node:assert/strict";
import type { Incident } from "@workspace/api-client-react";
import { prActionInput, prConfirmation, prStatusLabel, isDone } from "./pr-status";

const incident: Incident = {
  id: 100, repository: "example/service", branch: "main", stack_trace: "TypeError: missing input",
  error_type: "TypeError", status: "active", created_at: "2026-11-10T00:00:00Z",
  elapsed_seconds: 4, simulated: true, pr_url: null, slack_status: "not_sent", slack_error: null,
  diagnosis: {
    file_path: "src/index.js", original_code_snippet: "x.id", patched_code_snippet: "x?.id",
    full_patched_file: "export const handler = x => x?.id;", root_cause_summary: "Missing input.",
    suspect_commit_sha: null, suspect_author: null, confidence_score: 80, warnings: [],
    regression_test: { file_path: "tests/patchwork.test.js", content: "test edge case",
      description: "Missing input", run_command: "node --test" },
  },
};

test("frontend confirmation and request inputs distinguish real merge consent from draft-only writes", () => {
  assert.deepEqual(prActionInput("manual"), { mode: "manual", confirm_auto_merge: false });
  assert.deepEqual(prActionInput("auto_merge"), { mode: "auto_merge", confirm_auto_merge: true });
  assert.match(prConfirmation(incident, "manual"), /DRAFT pull request/);
  assert.match(prConfirmation(incident, "manual"), /will not merge/);
  const message = prConfirmation(incident, "auto_merge");
  for (const detail of ["example/service", "main", "REAL MERGE", "SIMULATED ONLY", "no tests have been executed", "deployments", "GitHub branch protections"]) {
    assert.ok(message.includes(detail), `Confirmation must disclose ${detail}`);
  }
});
test("ledger labels reflect persisted outcomes after a JSON round trip, never the current selector", () => {
  for (const [state, status, label, done] of [
    ["draft", "draft_pr_opened", "Draft PR Created", false],
    ["open", "pr_opened", "PR Open · Not Merged", false],
    ["closed", "pr_opened", "PR Closed · Not Merged", false],
    ["unknown", "pr_opened", "PR Status Unconfirmed", false],
    ["merged", "auto_merged", "Auto-Merged to main", true],
  ] as const) {
    const saved: Incident = JSON.parse(JSON.stringify({ ...incident, status, pr_outcome: {
      state, mode: "auto_merge", validation: "simulated", error: null, merged_sha: state === "merged" ? "a".repeat(40) : null,
    } }));
    assert.equal(prStatusLabel(saved), label);
    assert.equal(isDone(saved), done);
  }
});
