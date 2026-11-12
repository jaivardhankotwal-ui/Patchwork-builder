import type { Incident, IncidentPrInput } from "@workspace/api-client-react";

export type AutonomyMode = "manual" | "auto_merge";
export const isMerged = (i: Incident) => i.pr_outcome?.state === "merged" || i.status === "auto_merged" || i.status === "merged";
export const isDone = (i: Incident) => i.status === "resolved" || isMerged(i);
export function prStatusLabel(i: Incident) {
  if (isMerged(i)) return `${i.pr_outcome?.mode === "auto_merge" || i.status === "auto_merged" ? "Auto-Merged" : "Merged"} to ${i.branch}`;
  if (i.pr_outcome?.state === "closed") return "PR Closed · Not Merged";
  if (i.pr_outcome?.state === "unknown") return "PR Status Unconfirmed";
  if (i.status === "resolved") return "resolved";
  if (i.pr_outcome?.state === "open" || i.status === "pr_opened") return "PR Open · Not Merged";
  return i.status === "draft_pr_opened" ? "Draft PR Created" : i.status;
}

export function prActionInput(mode: AutonomyMode): IncidentPrInput {
  return { mode, confirm_auto_merge: mode === "auto_merge" };
}

export function prConfirmation(i: Incident, mode: AutonomyMode) {
  return mode === "auto_merge"
    ? `AUTONOMOUS AUTO-MERGE — ${i.repository} → ${i.branch}\n\nThis creates/reuses a PR containing the AI fix and regression test, marks it ready, and requests a REAL MERGE into main. Validation is SIMULATED ONLY: no tests have been executed and correctness is not established. GitHub branch protections still apply. A merge may trigger your repository's deployments.${i.simulated ? "\nThis incident is simulated, but this GitHub merge would be REAL." : ""}\n\nConfirm Auto-Merge?`
    : `Create a branch, commit the proposed fix${i.diagnosis.regression_test ? " and generated regression test (not run)" : ""} and open a DRAFT pull request in ${i.repository} against ${i.branch}? This writes to GitHub, but will not merge or deploy anything.${i.simulated ? " This incident is simulated." : ""}`;
}
