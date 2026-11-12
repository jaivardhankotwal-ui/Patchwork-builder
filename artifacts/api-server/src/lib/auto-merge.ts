import { github, repoUrl, sourceFor, ServiceError } from "./github";
import type { Incident } from "./incident-types";
import { prReport } from "./draft-pr";

type Dependencies = { request: typeof github; source: typeof sourceFor };
const live: Dependencies = { request: github, source: sourceFor };
export type PrOutcome = NonNullable<Incident["pr_outcome"]>;
export type PrMode = PrOutcome["mode"];

export function requireMergeConsent(mode: PrMode, confirmed: boolean, incident: Incident) {
  if (mode !== "auto_merge") return;
  if (!confirmed) throw new ServiceError("Explicit Auto-Merge confirmation is required. Simulated validation does not execute tests.", 400);
  if (incident.branch !== "main") throw new ServiceError("Autonomous merging is limited to main. Use Manual Review for other base branches.", 422);
  if (!incident.diagnosis.regression_test) throw new ServiceError("Re-analyze this incident to generate a regression test before using Auto-Merge.", 422);
}

export function prEndpoint(incident: Incident, url: string) {
  const prefix = `https://github.com/${incident.repository}/pull/`;
  const number = url.startsWith(prefix) ? url.slice(prefix.length) : "";
  if (!/^[1-9]\d*$/.test(number)) throw new ServiceError("The saved PR URL does not match this repository.", 409);
  return `${repoUrl(incident.repository)}/pulls/${number}`;
}

export async function readPr(incident: Incident, url: string, branch: string, deps = live) {
  const pr = await deps.request(prEndpoint(incident, url));
  if (pr.base?.ref !== incident.branch || pr.base?.repo?.full_name?.toLowerCase() !== incident.repository.toLowerCase() ||
      pr.head?.ref !== branch || pr.head?.repo?.full_name?.toLowerCase() !== incident.repository.toLowerCase()) {
    throw new ServiceError("PR identity changed. Check the repository and branch before retrying.", 409);
  }
  return pr;
}

export function outcomeFor(pr: any, mode: PrMode, validation: PrOutcome["validation"], error: string | null = null): PrOutcome {
  return {
    state: pr.merged === true ? "merged" : pr.state === "closed" ? "closed" : pr.draft === true ? "draft" : "open",
    mode, validation, error, merged_sha: pr.merged === true ? pr.merge_commit_sha ?? null : null,
  };
}

export function incidentPrStatus(outcome: PrOutcome) {
  return outcome.state === "merged" ? outcome.mode === "auto_merge" ? "auto_merged" : "merged" : outcome.state === "draft" ? "draft_pr_opened" : "pr_opened";
}

// The only validation here is a simulation. It deliberately creates no GitHub
// check run or passing status: branch protections must evaluate real CI/reviews.
export async function mergePr(incident: Incident, url: string, branch: string, confirmed: boolean, deps = live) {
  requireMergeConsent("auto_merge", confirmed, incident);
  const endpoint = prEndpoint(incident, url);
  let pr = await readPr(incident, url, branch, deps);
  if (pr.merged === true) return outcomeFor(pr, "auto_merge", "simulated");
  if (pr.state !== "open") throw new ServiceError("The PR is closed without merging. Reopen it on GitHub before retrying.", 409);
  const sha = pr.head.sha;
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/i.test(sha)) {
    throw new ServiceError("GitHub did not provide a valid PR head SHA. No merge was attempted.", 409);
  }
  // An explicit confirmation authorizes exactly the saved fix and new test,
  // never unrelated additions made to the patch branch in another session.
  const test = incident.diagnosis.regression_test!;
  const files = await deps.request(`${endpoint}/files?per_page=3`);
  if (pr.changed_files !== 2 || !Array.isArray(files) || files.length !== 2 ||
      !files.some(f => f.filename === incident.diagnosis.file_path && f.status === "modified") ||
      !files.some(f => f.filename === test.file_path && f.status === "added")) {
    throw new ServiceError("PR changes no longer match the proposed fix and new regression test. Manual review required.", 409);
  }
  const [fixContent, testContent] = await Promise.all([
    deps.source(incident.repository, sha, incident.diagnosis.file_path),
    deps.source(incident.repository, sha, test.file_path),
  ]);
  if (fixContent !== incident.diagnosis.full_patched_file || testContent !== test.content) {
    throw new ServiceError("PR contents changed after diagnosis. Manual review required.", 409);
  }
  await deps.request(endpoint, { method: "PATCH", body: { body: prReport(incident, "auto_merge") } });
  if (pr.draft) {
    if (typeof pr.node_id !== "string" || !pr.node_id) throw new ServiceError("GitHub did not provide the draft's identity. No merge was attempted.", 409);
    const ready = await deps.request("/graphql", { method: "POST", body: {
      query: "mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { isDraft } } }",
      variables: { id: pr.node_id },
    } });
    if (ready.errors?.length || ready.data?.markPullRequestReadyForReview?.pullRequest?.isDraft !== false) {
      throw new ServiceError("GitHub could not mark the draft ready for review. No merge was requested.", 409);
    }
  }
  pr = await readPr(incident, url, branch, deps);
  if (pr.merged === true) return outcomeFor(pr, "auto_merge", "simulated");
  // Fail closed on pending/unknown CI, reviews, conflicts, stale heads, or rules.
  // No bypass flag, force push, fabricated green check, or automatic retry loop.
  if (pr.head.sha !== sha || pr.state !== "open" || pr.draft || pr.mergeable !== true || pr.mergeable_state !== "clean") {
    throw new ServiceError("GitHub has not confirmed a clean, ready PR. Required checks, reviews, conflicts, or a changed head may block it. Check GitHub, then explicitly retry.", 409);
  }
  const result = await deps.request(`${endpoint}/merge`, { method: "PUT", body: {
    sha, merge_method: "merge",
    commit_title: `fix: automated Patchwork fix for ${incident.error_type}`,
  } });
  if (result.merged !== true || typeof result.sha !== "string" || !result.sha) {
    throw new ServiceError("GitHub did not confirm the merge. Check PR protections and retry only after reviewing its live status.", 409);
  }
  return { state: "merged", mode: "auto_merge", validation: "simulated", error: null, merged_sha: result.sha } satisfies PrOutcome;
}

export async function resolvePrOutcome(incident: Incident, url: string, branch: string, mode: PrMode, confirmed: boolean, deps = live): Promise<PrOutcome> {
  let outcome: PrOutcome = { state: "unknown", mode, validation: "not_run", error: null, merged_sha: null };
  try {
    const current = await readPr(incident, url, branch, deps);
    // A PR already merged outside this attempt is not evidence that Patchwork
    // performed an autonomous merge. Preserve only an already-confirmed mode.
    const observedMode = current.merged === true ? incident.pr_outcome?.state === "merged" ? incident.pr_outcome.mode : "manual" : mode;
    outcome = outcomeFor(current, observedMode,
      incident.pr_outcome?.validation ?? "not_run");
    if (mode === "auto_merge" && outcome.state !== "merged") {
      requireMergeConsent(mode, confirmed, incident);
      outcome.validation = "simulated";
      outcome = await mergePr(incident, url, branch, confirmed, deps);
    }
  } catch (error) {
    // A timeout is not proof of failure: reconcile once, without a second
    // merge request. If GitHub is unreachable, show unknown, not "draft".
    outcome = { ...outcome, state: "unknown", merged_sha: null };
    try { outcome = outcomeFor(await readPr(incident, url, branch, deps), mode, outcome.validation); } catch {}
    outcome.error = outcome.state === "merged" ? null : error instanceof ServiceError ? error.message
      : "GitHub could not confirm the PR outcome. Check its live status before explicitly retrying.";
  }
  return outcome;
}
