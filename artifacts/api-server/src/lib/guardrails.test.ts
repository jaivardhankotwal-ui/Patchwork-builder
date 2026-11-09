import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { preparePr, writeDraftPr, prReport } from "./draft-pr";
import { normalizeSentry, verifySentrySignature } from "./webhook-payload";
import { ServiceError } from "./github";
import { slackMessage } from "./slack";
import type { Incident } from "./incident-types";

const original = "function handler(x) {\n  return x.id;\n}\n";
const patched = "function handler(x) {\n  return x?.id;\n}\n";
const fixture: Incident = {
  id: 123, repository: "example/service", branch: "main", error_type: "TypeError",
  stack_trace: "TypeError: Cannot read properties of undefined\n at handler (/app/src/index.js:2:12)",
  status: "active", created_at: "2026-11-09T00:00:00Z", elapsed_seconds: 6.2, simulated: false,
  pr_url: null, slack_status: "not_sent", slack_error: null,
  diagnosis: { file_path: "src/index.js", source_commit_sha: "a".repeat(40),
    suspect_commit_sha: "b".repeat(40), suspect_author: "Example Dev · 2026-11-09", suspect_author_login: "example-dev",
    confidence_score: 84, root_cause_summary: "Undefined input reaches handler.",
    original_code_snippet: "return x.id;", patched_code_snippet: "return x?.id;", full_patched_file: patched, warnings: [] },
};
test("preflight pins latest base and accepts an unchanged source", async () => {
  const result = await preparePr(fixture, {
    request: async () => ({ sha: "c".repeat(40) }),
    source: async () => original,
  });
  assert.equal(result.baseSha, "c".repeat(40));
});
test("preflight rejects stale files before any writes", async () => {
  await assert.rejects(() => preparePr(fixture, {
    request: async () => ({ sha: "c".repeat(40) }),
    source: async (_repo, ref) => ref === fixture.diagnosis.source_commit_sha ? original : original + "// newer work",
  }), /target file changed/);
});
test("preflight rejects unrecoverable old diagnoses and empty fixes", async () => {
  await assert.rejects(() => preparePr({ ...fixture, diagnosis: { ...fixture.diagnosis, source_commit_sha: null, patched_code_snippet: "" } }, {
    request: async () => ({ sha: "a".repeat(40) }), source: async () => original,
  }), /source snapshot/);
  await assert.rejects(() => preparePr({ ...fixture, diagnosis: { ...fixture.diagnosis, full_patched_file: original } }, {
    request: async () => ({ sha: "a".repeat(40) }), source: async () => original,
  }), /non-empty patch/);
});
test("legacy diagnosis can recover a unique reverse patch only when current file exactly matches", async () => {
  const legacy = { ...fixture, diagnosis: { ...fixture.diagnosis, source_commit_sha: null } };
  const deps = { request: async () => ({ sha: "c".repeat(40) }), source: async () => original };
  assert.equal((await preparePr(legacy, deps)).original, original);
  await assert.rejects(() => preparePr(legacy, { ...deps, source: async () => original + "// new changes" }), /target file changed/);
});
test("creates a branch, one correctly encoded commit and a draft-only PR with guardrail report", async () => {
  const calls: {path: string; options: any}[] = [];
  const deps = {
    source: async () => original,
    request: async (path: string, options: any = {}) => {
      calls.push({ path, options });
      if (path.includes("/pulls?")) return [];
      if (path.includes("/git/ref/heads/")) throw new ServiceError("not found", 404);
      if (path.endsWith("/git/refs")) return { object: { sha: "c".repeat(40) } };
      if (path.includes("/contents/") && !options.method) return { sha: "blob-sha", content: Buffer.from(original).toString("base64") };
      if (options.method === "PUT") return { commit: { sha: "d".repeat(40) } };
      if (path.endsWith("/pulls")) return { draft: true, html_url: "https://github.com/example/service/pull/1" };
      throw new Error(`Unexpected ${path}`);
    },
  };
  const url = await writeDraftPr(fixture, "patchwork/fix-bbbbbbbb-12345", "c".repeat(40), original, deps);
  assert.equal(url, "https://github.com/example/service/pull/1");
  const commit = calls.find(c => c.options.method === "PUT")!.options.body;
  assert.equal(commit.message, "fix: automated Patchwork fix for TypeError");
  assert.equal(Buffer.from(commit.content, "base64").toString(), patched);
  assert.equal(commit.sha, "blob-sha");
  const pr = calls.find(c => c.path.endsWith("/pulls"))!.options.body;
  assert.equal(pr.draft, true);
  assert.equal(pr.base, "main");
  assert.match(pr.body, /Opened as a Draft PR by Patchwork AI for senior dev verification\. Never force-merged\./);
  assert.ok(!calls.some(c => /\/merge$/.test(c.path)));
});
test("retry returns existing PR with no additional writes", async () => {
  let count = 0;
  const url = await writeDraftPr(fixture, "patchwork/existing", "c".repeat(40), original, {
    source: async () => original, request: async (_path, opts) => {
      assert.equal(opts?.method, undefined); count++;
      return [{ html_url: "https://github.com/example/service/pull/2" }];
    },
  });
  assert.equal(count, 1); assert.match(url, /pull\/2$/);
});
test("retry skips a commit already present on the branch", async () => {
  const methods: string[] = [];
  await writeDraftPr(fixture, "patchwork/retry", "c".repeat(40), original, {
    source: async () => original, request: async (path, opts = {}) => {
      methods.push(opts.method || "GET");
      if (path.includes("/pulls?")) return [];
      if (path.includes("/git/ref/")) return { object: { sha: "d".repeat(40) } };
      if (path.includes("/contents/")) return { sha: "blob", content: Buffer.from(patched).toString("base64") };
      return { draft: true, html_url: "https://github.com/example/service/pull/3" };
    },
  });
  assert.ok(!methods.includes("PUT"));
});
test("signed raw webhook verification rejects tampering and missing signatures", () => {
  const body = Buffer.from('{"repository":"example/service"}');
  const signature = createHmac("sha256", "test-signing-key-not-a-real-secret").update(body).digest("hex");
  assert.ok(verifySentrySignature(body, signature, "test-signing-key-not-a-real-secret"));
  assert.ok(!verifySentrySignature(Buffer.from("{}"), signature, "test-signing-key-not-a-real-secret"));
  assert.ok(!verifySentrySignature(body, undefined, "test-signing-key-not-a-real-secret"));
  assert.ok(!verifySentrySignature(body, "invalid", "test-signing-key-not-a-real-secret"));
});
test("normalizes direct JSON and native Python / Node Sentry events", () => {
  assert.equal(normalizeSentry(fixture).repository, fixture.repository);
  for (const [platform, file] of [["python", "app/handler.py"], ["node", "src/index.js"]]) {
    const input = normalizeSentry({ repository: "example/service", data: { event: { platform,
      exception: { values: [{ type: "TypeError", value: "missing input", stacktrace: { frames: [{ filename: file, lineno: 2, function: "handler" }] } }] } } } });
    assert.match(input.stack_trace, /TypeError/); assert.ok(input.stack_trace.includes(file));
    assert.equal(input.branch, "main");
  }
});
test("Slack has truthful attribution and only links to a PR when one exists", () => {
  const without = JSON.stringify(slackMessage(fixture));
  assert.match(without, /Introduced by @example-dev/);
  assert.match(without, /No draft PR has been created/);
  const withPr = JSON.stringify(slackMessage({ ...fixture, pr_url: "https://github.com/example/service/pull/1" }));
  assert.match(withPr, /Review Draft PR on GitHub/);
  assert.match(withPr, /https:\/\/github.com\/example\/service\/pull\/1/);
  assert.ok(!withPr.includes("ready-to-merge"));
  assert.match(prReport({ ...fixture, simulated: true }), /SIMULATION/);
});
