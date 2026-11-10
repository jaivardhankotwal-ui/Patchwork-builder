import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { preparePr, writeDraftPr, prReport } from "./draft-pr";
import { normalizeSentry, verifySentrySignature } from "./webhook-payload";
import { ServiceError } from "./github";
import { slackMessage } from "./slack";
import type { Incident } from "./incident-types";
import { validateRegressionTest } from "./regression-test";
import { AnalyzeIncidentResponse } from "@workspace/api-zod";

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

const regression = {
  file_path: "tests/patchwork_handler.test.js",
  content: 'import { handler } from "../src/index.js";\nimport { test } from "node:test";\nimport assert from "node:assert/strict";\ntest("handles missing input", () => assert.equal(handler(undefined), undefined));\n',
  run_command: "node --test tests/patchwork_handler.test.js",
  description: "Undefined input must not throw when the handler reads id.",
};
const withTest: Incident = { ...fixture, diagnosis: { ...fixture.diagnosis, regression_test: regression } };
test("regression tests persist through the incident contract; older diagnoses remain readable", () => {
  assert.deepEqual(AnalyzeIncidentResponse.parse(withTest).diagnosis.regression_test, regression);
  assert.equal(AnalyzeIncidentResponse.parse(fixture).diagnosis.regression_test, undefined);
  assert.match(prReport(withTest), /tests\/patchwork_handler\.test\.js/);
  assert.match(prReport(withTest), /Not executed or verified/);
});
test("test path validation accepts pytest and JS tests but rejects unsafe paths", () => {
  validateRegressionTest(regression, "src/index.js");
  validateRegressionTest({ ...regression, file_path: "tests/test_checkout.py" }, "checkout.py");
  for (const path of ["../tests/test_x.py", "/tests/test_x.py", ".github/tests/test_x.py", "tests/../test_x.py", "src/index.js", "tests//x.py", "tests/config.json"]) {
    assert.throws(() => validateRegressionTest({ ...regression, file_path: path }, "src/index.js"), /unsafe/);
  }
});
test("preflight rejects a generated test path already on the base branch", async () => {
  await assert.rejects(() => preparePr(withTest, {
    source: async () => original,
    request: async path => path.includes("/contents/") ? { sha: "existing" } : { sha: "base" },
  }), /already exists/);
});
test("draft PR includes fix and new test with create-only semantics", async () => {
  const writes: { path: string; body: any }[] = [];
  await writeDraftPr(withTest, "patchwork/test", "base", original, {
    source: async () => original,
    request: async (path, opts = {}) => {
      if (opts.method === "PUT") { writes.push({ path, body: opts.body }); return {}; }
      if (path.includes("/pulls?")) return [];
      if (path.includes("/git/ref/")) return { object: { sha: "base" } };
      if (path.includes("/contents/tests/")) throw new ServiceError("not found", 404);
      if (path.includes("/contents/")) return { sha: "source-blob", content: Buffer.from(original).toString("base64") };
      if (path.endsWith("/pulls")) {
        assert.equal(writes.length, 2);
        assert.equal((opts.body as { draft: boolean }).draft, true);
        return { draft: true, html_url: "https://github.com/example/service/pull/4" };
      }
      throw new Error(`Unexpected ${path}`);
    },
  });
  assert.equal(Buffer.from(writes[0].body.content, "base64").toString(), patched);
  assert.equal(Buffer.from(writes[1].body.content, "base64").toString(), regression.content);
  assert.equal(writes[1].body.sha, undefined);
  assert.match(writes[1].path, /tests\/patchwork_handler\.test\.js$/);
});
test("retry after patch commit writes only the missing test, then retry after both skips all writes", async () => {
  for (const testExists of [false, true]) {
    const writes: string[] = [];
    await writeDraftPr(withTest, "patchwork/retry", "base", original, {
      source: async () => original,
      request: async (path, opts = {}) => {
        if (opts.method === "PUT") { writes.push(path); return {}; }
        if (path.includes("/pulls?")) return [];
        if (path.includes("/git/ref/")) return { object: { sha: "head" } };
        if (path.includes("/contents/tests/")) {
          if (!testExists) throw new ServiceError("not found", 404);
          return { content: Buffer.from(regression.content).toString("base64") };
        }
        if (path.includes("/contents/")) return { content: Buffer.from(patched).toString("base64") };
        return { draft: true, html_url: "https://github.com/example/service/pull/5" };
      },
    });
    assert.equal(writes.length, testExists ? 0 : 1);
    if (!testExists) assert.match(writes[0], /contents\/tests\//);
  }
});
test("different test content on a recovery branch is never overwritten", async () => {
  await assert.rejects(() => writeDraftPr(withTest, "patchwork/retry", "base", original, {
    source: async () => original,
    request: async (path, opts = {}) => {
      assert.equal(opts.method, undefined);
      if (path.includes("/pulls?")) return [];
      if (path.includes("/git/ref/")) return { object: { sha: "head" } };
      return { content: Buffer.from(path.includes("/contents/tests/") ? "// human work" : patched).toString("base64") };
    },
  }), /Refusing to overwrite/);
});
