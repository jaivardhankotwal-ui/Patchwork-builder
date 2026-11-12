import { test } from "node:test";
import assert from "node:assert/strict";
import { CreateIncidentPrBody, AnalyzeIncidentResponse } from "@workspace/api-zod";
import { incidentPrStatus, mergePr, readPr, requireMergeConsent, resolvePrOutcome } from "./auto-merge";
import { prReport } from "./draft-pr";
import { ServiceError } from "./github";
import { slackMessage } from "./slack";
import type { Incident } from "./incident-types";

const sha = "a".repeat(40);
const branch = "patchwork/fix-aaaaaaaa-12345";
const url = "https://github.com/example/service/pull/1";
const endpoint = "/repos/example/service/pulls/1";
const incident: Incident = {
  id: 100, repository: "example/service", branch: "main", stack_trace: "TypeError: missing input",
  error_type: "TypeError", status: "active", created_at: "2026-11-10T00:00:00Z",
  elapsed_seconds: 4, simulated: true, pr_url: url, slack_status: "not_sent", slack_error: null,
  diagnosis: {
    file_path: "src/index.js", original_code_snippet: "x.id", patched_code_snippet: "x?.id",
    full_patched_file: "export const handler = x => x?.id;", root_cause_summary: "Missing input.",
    suspect_commit_sha: sha, suspect_author: "Example Dev", confidence_score: 80, warnings: [],
    regression_test: { file_path: "tests/patchwork.test.js", content: "test('missing input', () => handler(undefined));",
      description: "Missing input", run_command: "node --test" },
  },
};
function mocked() {
  let current: any = { state: "open", draft: true, merged: false, node_id: "PR_example", changed_files: 2,
    mergeable: true, mergeable_state: "clean", head: { sha, ref: branch, repo: { full_name: "example/service" } },
    base: { ref: "main", repo: { full_name: "example/service" } } };
  const calls: { path: string; opts: { method?: string; body?: any } }[] = [];
  let onMerge: (() => any) | undefined;
  let onReady: (() => any) | undefined;
  let changeOnReady: (() => void) | undefined;
  let files = [{ filename: incident.diagnosis.file_path, status: "modified" },
    { filename: incident.diagnosis.regression_test!.file_path, status: "added" }];
  const deps = {
    source: async (_repo: string, ref: string, path: string) => {
      assert.equal(ref, sha);
      return path === incident.diagnosis.file_path ? incident.diagnosis.full_patched_file : incident.diagnosis.regression_test!.content;
    },
    request: async (path: string, opts: { method?: string; body?: any } = {}): Promise<any> => {
      calls.push({ path, opts });
      if (path === endpoint && !opts.method) return structuredClone(current);
      if (path === endpoint && opts.method === "PATCH") return current;
      if (path === `${endpoint}/files?per_page=3`) return files;
      if (path === "/graphql") {
        if (onReady) return onReady();
        current.draft = false; changeOnReady?.();
        return { data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } } };
      }
      if (path === `${endpoint}/merge`) {
        if (onMerge) return onMerge();
        current.merged = true; current.state = "closed"; current.merge_commit_sha = "b".repeat(40);
        return { merged: true, sha: current.merge_commit_sha };
      }
      throw new Error(`Unexpected GitHub request: ${path}`);
    },
  };
  return { deps, calls, get current() { return current; }, set current(value) { current = value; },
    set onMerge(value: () => any) { onMerge = value; }, set onReady(value: () => any) { onReady = value; },
    set changeOnReady(value: () => void) { changeOnReady = value; }, set files(value: typeof files) { files = value; } };
}
test("safe default is manual; auto merge needs explicit boolean consent, main and a generated test", async () => {
  assert.deepEqual(CreateIncidentPrBody.parse({}), { mode: "manual", confirm_auto_merge: false });
  assert.equal(CreateIncidentPrBody.safeParse({ mode: "unsafe" }).success, false);
  assert.equal(CreateIncidentPrBody.safeParse({ mode: "auto_merge", confirm_auto_merge: "true" }).success, false);
  const mock = mocked();
  await assert.rejects(() => mergePr(incident, url, branch, false, mock.deps), /Explicit Auto-Merge confirmation/);
  assert.equal(mock.calls.length, 0);
  assert.throws(() => requireMergeConsent("auto_merge", true, { ...incident, branch: "develop" }), /limited to main/);
  assert.throws(() => requireMergeConsent("auto_merge", true, { ...incident, diagnosis: { ...incident.diagnosis, regression_test: null } }), /generate a regression test/);
});
test("manual mode only reads GitHub, leaves the draft and does not simulate tests or merge", async () => {
  const mock = mocked();
  const outcome = await resolvePrOutcome(incident, url, branch, "manual", false, mock.deps);
  assert.equal(outcome.state, "draft");
  assert.equal(outcome.validation, "not_run");
  assert.equal(incidentPrStatus(outcome), "draft_pr_opened");
  assert.ok(mock.calls.every(c => !c.opts.method));
});
test("explicit auto mode verifies fix and test, marks ready, and requests a SHA-pinned merge exactly once", async () => {
  const mock = mocked();
  const outcome = await resolvePrOutcome(incident, url, branch, "auto_merge", true, mock.deps);
  assert.equal(outcome.state, "merged");
  assert.equal(outcome.validation, "simulated");
  assert.equal(incidentPrStatus(outcome), "auto_merged");
  assert.equal(outcome.error, null);
  const merges = mock.calls.filter(c => c.path.endsWith("/merge"));
  assert.equal(merges.length, 1);
  assert.deepEqual(merges[0].opts, { method: "PUT", body: {
    sha, merge_method: "merge", commit_title: "fix: automated Patchwork fix for TypeError",
  } });
  assert.ok(mock.calls.some(c => c.path === "/graphql"));
  assert.ok(!mock.calls.some(c => /check-runs|statuses|protection/.test(c.path)));
  assert.match(prReport(incident, "auto_merge"), /SIMULATED ONLY/);
  assert.ok(!prReport(incident, "auto_merge").includes("No automatic merge"));
  const reloaded = AnalyzeIncidentResponse.parse({ ...incident, pr_outcome: outcome, status: "auto_merged" });
  assert.equal(reloaded.pr_outcome?.merged_sha, "b".repeat(40));
  const message = JSON.stringify(slackMessage(reloaded));
  assert.match(message, /View Merged PR/);
  assert.match(message, /SIMULATED ONLY/);
  assert.ok(!message.includes("Never automatically merged"));
});
test("retry after confirmed merge only reconciles, never writes or creates a second merge", async () => {
  const mock = mocked();
  await mergePr(incident, url, branch, true, mock.deps);
  mock.calls.length = 0;
  const outcome = await resolvePrOutcome(incident, url, branch, "auto_merge", true, mock.deps);
  assert.equal(outcome.state, "merged");
  assert.ok(mock.calls.every(c => !c.opts.method));
});
test("an already externally merged PR is not mislabeled as a new autonomous merge", async () => {
  const mock = mocked();
  mock.current.merged = true;
  mock.current.merge_commit_sha = "b".repeat(40);
  const outcome = await resolvePrOutcome(incident, url, branch, "auto_merge", true, mock.deps);
  assert.equal(outcome.mode, "manual");
  assert.equal(incidentPrStatus(outcome), "merged");
  assert.ok(mock.calls.every(c => !c.opts.method));
});
test("blocked/unknown GitHub state fails closed, persists actual ready state and never calls merge", async () => {
  for (const state of ["blocked", "dirty", "behind", "unstable", "unknown", null]) {
    const mock = mocked();
    mock.current.mergeable_state = state;
    const outcome = await resolvePrOutcome(incident, url, branch, "auto_merge", true, mock.deps);
    assert.equal(outcome.state, "open");
    assert.equal(outcome.validation, "simulated");
    assert.match(outcome.error!, /GitHub has not confirmed/);
    assert.equal(incidentPrStatus(outcome), "pr_opened");
    assert.ok(!mock.calls.some(c => c.path.endsWith("/merge")));
  }
});
test("closed unmerged PR stays closed, not draft and not merged", async () => {
  const mock = mocked();
  mock.current.state = "closed";
  const outcome = await resolvePrOutcome(incident, url, branch, "auto_merge", true, mock.deps);
  assert.equal(outcome.state, "closed");
  assert.match(outcome.error!, /closed without merging/);
  assert.ok(mock.calls.every(c => !c.opts.method));
});
test("changed head, malformed SHA, identity or extra files never reach merge", async () => {
  for (const variant of ["head", "sha", "identity", "files"]) {
    const mock = mocked();
    if (variant === "head") mock.changeOnReady = () => { mock.current.head.sha = "c".repeat(40); };
    if (variant === "sha") mock.current.head.sha = undefined;
    if (variant === "identity") mock.current.head.ref = "someone-elses-work";
    if (variant === "files") mock.current.changed_files = 3;
    await assert.rejects(() => mergePr(incident, url, branch, true, mock.deps), ServiceError);
    assert.ok(!mock.calls.some(c => c.path.endsWith("/merge")));
  }
});
test("tampered fix/test, replaced test file and wrong repository URL fail before readiness writes", async () => {
  const mock = mocked();
  await assert.rejects(() => mergePr(incident, url, branch, true, {
    ...mock.deps, source: async () => "// someone else's code",
  }), /contents changed/);
  mock.files = [{ filename: incident.diagnosis.file_path, status: "modified" },
    { filename: incident.diagnosis.regression_test!.file_path, status: "modified" }];
  await assert.rejects(() => mergePr(incident, url, branch, true, mock.deps), /no longer match/);
  await assert.rejects(() => readPr(incident, "https://github.com/another/repo/pull/1", branch, mock.deps), /does not match/);
  assert.ok(mock.calls.every(c => !c.opts.method));
});
test("readiness errors retain a draft and do not submit a merge", async () => {
  const mock = mocked();
  mock.onReady = () => ({ errors: [{ message: "forbidden" }] });
  const outcome = await resolvePrOutcome(incident, url, branch, "auto_merge", true, mock.deps);
  assert.equal(outcome.state, "draft");
  assert.match(outcome.error!, /could not mark/);
  assert.ok(!mock.calls.some(c => c.path.endsWith("/merge")));
});
test("GitHub merged:false and permission failures never report success", async () => {
  for (const variant of ["false", "permission"]) {
    const mock = mocked();
    mock.onMerge = () => {
      if (variant === "permission") throw new ServiceError("GitHub access denied", 502);
      return { merged: false, message: "Required review missing" };
    };
    const outcome = await resolvePrOutcome(incident, url, branch, "auto_merge", true, mock.deps);
    assert.equal(outcome.state, "open");
    assert.ok(outcome.error);
    assert.equal(outcome.merged_sha, null);
  }
});
test("lost merge response reconciles remote success without retrying a merge", async () => {
  const mock = mocked();
  mock.onMerge = () => {
    mock.current.merged = true; mock.current.merge_commit_sha = "d".repeat(40);
    throw new Error("network timeout");
  };
  const outcome = await resolvePrOutcome(incident, url, branch, "auto_merge", true, mock.deps);
  assert.equal(outcome.state, "merged");
  assert.equal(outcome.error, null);
  assert.equal(mock.calls.filter(c => c.path.endsWith("/merge")).length, 1);
});
test("unreachable GitHub records unknown outcome instead of inventing draft or merged success", async () => {
  const mock = mocked();
  const outcome = await resolvePrOutcome(incident, url, branch, "manual", false, {
    ...mock.deps, request: async () => { throw new Error("network unavailable"); },
  });
  assert.equal(outcome.state, "unknown");
  assert.ok(outcome.error);
  assert.equal(outcome.merged_sha, null);
});
