import type { Incident } from "./incident-types";
import { github, repoUrl, sourceFor, ServiceError } from "./github";
import { validateRegressionTest } from "./regression-test";

// Dependencies are injectable so safety checks can be tested without writing to GitHub.
type Dependencies = { request: typeof github; source: typeof sourceFor };
const live: Dependencies = { request: github, source: sourceFor };
const fileUrl = (repo: string, file: string) => `${repoUrl(repo)}/contents/${file.split("/").map(encodeURIComponent).join("/")}`;

export function prReport(incident: Incident) {
  const d = incident.diagnosis;
  const fence = "`".repeat(Math.max(3, ...[...incident.stack_trace.matchAll(/`+/g)].map(m => m[0].length + 1)));
  return `## 🚨 Incident Summary & Stack Trace
${incident.simulated ? "**SIMULATION — not a confirmed production incident.**\n" : ""}
**Error:** ${incident.error_type}
**File:** \`${d.file_path}\`
**Diagnosis time:** ${incident.elapsed_seconds}s

${fence}text
${incident.stack_trace.slice(0, 35000)}
${fence}

## 🔍 Root Cause Analysis
${d.root_cause_summary.slice(0, 12000)}

**Model confidence:** ${d.confidence_score}% (not a test result).

## 🎯 Blamed Commit & Author
**Suspect commit:** ${d.suspect_commit_sha ? `[\`${d.suspect_commit_sha}\`](https://github.com/${incident.repository}/commit/${d.suspect_commit_sha})` : "Not identified"}
**Author attribution:** ${d.suspect_author ?? "Not identified"}
This attribution is suspected from available history, not independently verified.

## 🧪 Regression Test
${d.regression_test ? `**File:** \`${d.regression_test.file_path}\`
${d.regression_test.description}

**Suggested command (review before running):** ${d.regression_test.run_command}

AI-generated test included in this PR. **Not executed or verified by Patchwork.** Review imports, dependencies and assertions; confirm it fails before the fix and passes afterward.` : "No regression test was saved for this older diagnosis. Re-analyze to generate one."}

## 🛡️ Guardrail Note
Opened as a Draft PR by Patchwork AI for senior dev verification. Never force-merged.

- Review the complete diff and run tests before marking ready for review.
- No automatic merge, force push, or branch-protection bypass is performed.
`;
}
export async function preparePr(incident: Incident, deps = live) {
  const d = incident.diagnosis;
  if (d.regression_test) validateRegressionTest(d.regression_test, d.file_path);
  if (!d.file_path || d.file_path.startsWith("/") || d.file_path.split("/").some(p => p === ".." || p === ".")) {
    throw new ServiceError("Unsafe patch file path.", 422);
  }
  const head = await deps.request(`${repoUrl(incident.repository)}/commits/${encodeURIComponent(incident.branch)}`);
  let original: string;
  if (d.source_commit_sha) {
    original = await deps.source(incident.repository, d.source_commit_sha, d.file_path);
  } else {
    // Legacy diagnoses already saved a validated complete patched file.
    // Reconstruct only an unambiguous reverse patch, then require an exact
    // current-file match below; never apply a full file based on guesswork.
    if (!d.patched_code_snippet || d.full_patched_file.split(d.patched_code_snippet).length !== 2) {
      throw new ServiceError("This older diagnosis has no recoverable source snapshot. Analyze the incident again before creating a PR.", 409);
    }
    original = d.full_patched_file.replace(d.patched_code_snippet, d.original_code_snippet);
  }
  if (!d.original_code_snippet || original.split(d.original_code_snippet).length !== 2 ||
      original.replace(d.original_code_snippet, d.patched_code_snippet) !== d.full_patched_file ||
      original === d.full_patched_file) {
    throw new ServiceError("No valid, non-empty patch is available. Analyze again before creating a PR.", 409);
  }
  const current = await deps.source(incident.repository, head.sha, d.file_path);
  if (current !== original) throw new ServiceError("The target file changed after diagnosis. Re-analyze before opening a PR; newer work was not overwritten.", 409);
  if (d.regression_test && await readOptionalFile(deps, incident.repository, head.sha, d.regression_test.file_path)) {
    throw new ServiceError("The generated test path already exists on the base branch. Re-analyze to avoid overwriting existing tests.", 409);
  }
  return { baseSha: head.sha as string, original };
}
async function readOptionalFile(deps: Dependencies, repository: string, ref: string, path: string) {
  try { return await deps.request(`${fileUrl(repository, path)}?ref=${encodeURIComponent(ref)}`); }
  catch (err) {
    if (err instanceof ServiceError && err.status === 404) return null;
    throw err;
  }
}
export async function writeDraftPr(incident: Incident, branch: string, baseSha: string, original: string, deps = live) {
  const repo = repoUrl(incident.repository);
  const test = incident.diagnosis.regression_test;
  if (test) validateRegressionTest(test, incident.diagnosis.file_path);
  // Recover a previously opened PR if its response or the database save was interrupted.
  const existing = await deps.request(`${repo}/pulls?state=all&head=${encodeURIComponent(incident.repository.split("/")[0] + ":" + branch)}&base=${encodeURIComponent(incident.branch)}`);
  if (existing.length) return existing[0].html_url as string;
  let ref;
  try { ref = await deps.request(`${repo}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`); }
  catch (err) {
    if (!(err instanceof ServiceError) || err.status !== 404) throw err;
    ref = await deps.request(`${repo}/git/refs`, { method: "POST", body: { ref: `refs/heads/${branch}`, sha: baseSha } });
  }
  const file = await deps.request(`${fileUrl(incident.repository, incident.diagnosis.file_path)}?ref=${encodeURIComponent(ref.object.sha)}`);
  const content = Buffer.from(file.content || "", "base64").toString("utf8");
  const existingTest = test ? await readOptionalFile(deps, incident.repository, ref.object.sha, test.file_path) : null;
  if (existingTest && (existingTest.type === "dir" || Buffer.from(existingTest.content || "", "base64").toString("utf8") !== test!.content)) {
    throw new ServiceError("The patch branch already has different content at the generated test path. Refusing to overwrite it.", 409);
  }
  if (content !== incident.diagnosis.full_patched_file) {
    if (content !== original) throw new ServiceError("The patch branch changed. Refusing to overwrite it.", 409);
    await deps.request(fileUrl(incident.repository, incident.diagnosis.file_path), {
      method: "PUT", body: {
        branch, sha: file.sha, content: Buffer.from(incident.diagnosis.full_patched_file).toString("base64"),
        message: `fix: automated Patchwork fix for ${incident.error_type}`,
      },
    });
  }
  // A separate create-only commit is retry-safe: if interrupted, preserve an
  // identical already-written test and never overwrite different branch content.
  if (test && !existingTest) {
    await deps.request(fileUrl(incident.repository, test.file_path), {
      method: "PUT", body: {
        branch, content: Buffer.from(test.content).toString("base64"),
        message: `test: regression coverage for ${incident.error_type}`,
      },
    });
  }
  const pr = await deps.request(`${repo}/pulls`, { method: "POST", body: {
    title: `fix: automated Patchwork fix for ${incident.error_type}`,
    head: branch, base: incident.branch, draft: true, body: prReport(incident),
  } });
  if (!pr.draft || !/^https:\/\/github\.com\//.test(pr.html_url)) throw new ServiceError("GitHub did not confirm a draft PR. Check the repository before retrying.", 502);
  return pr.html_url as string;
}
