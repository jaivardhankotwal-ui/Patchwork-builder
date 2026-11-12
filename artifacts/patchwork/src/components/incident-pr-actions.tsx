import { ExternalLink, GitPullRequest, Loader2, ShieldAlert } from "lucide-react";
import { useCreateIncidentPr, useGetMergeAccess, getGetMergeAccessQueryKey, type Incident } from "@workspace/api-client-react";
import { errMsg } from "@/lib/diff";
import { isMerged, prActionInput, prConfirmation, type AutonomyMode } from "@/lib/pr-status";
import { Link } from "wouter";

export function IncidentPrActions({ incident, mode, refresh }: { incident: Incident; mode: AutonomyMode; refresh: (i: Incident) => void }) {
  // Never retry a write automatically: every merge attempt needs fresh consent.
  const pr = useCreateIncidentPr({ mutation: { retry: false } });
  const auto = mode === "auto_merge";
  const access = useGetMergeAccess({ repository: incident.repository }, { query: {
    queryKey: getGetMergeAccessQueryKey({ repository: incident.repository }),
    enabled: auto, refetchInterval: 15000, staleTime: 0,
  } });
  const authorized = access.data?.allowed === true;
  const outcome = incident.pr_outcome;
  const merged = isMerged(incident);
  const closed = outcome?.state === "closed";
  const canAct = !merged && (auto || !incident.pr_url || outcome?.state === "unknown");
  const missingTest = auto && !incident.diagnosis.regression_test;
  const wrongBase = auto && incident.branch !== "main";
  const openPr = () => {
    if (!window.confirm(prConfirmation(incident, mode))) return;
    pr.mutate({ id: incident.id, data: prActionInput(mode) }, { onSuccess: refresh });
  };
  return (
    <div className={`rounded-lg border p-4 space-y-3 ${auto ? "border-amber-400/30 bg-amber-400/5" : "border-cyan-500/30 bg-cyan-500/5"}`}>
      <div className="flex items-start gap-2">
        <ShieldAlert className={`size-4 shrink-0 mt-0.5 ${auto ? "text-amber-300" : "text-cyan-400"}`} />
        <div className="text-xs text-zinc-400">
          <p className={`font-medium mb-1 ${auto ? "text-amber-200" : "text-cyan-200"}`}>{auto ? "Level 5 · Autonomous Auto-Merge" : "Human-in-the-Loop Guardrail"}</p>
          {auto ? "Opt-in real merge to main after confirmation. Simulated validation is not a passing test result. No protection bypass or force push." : "A senior developer must review and test this patch. Manual Review opens a draft PR and never merges it."}
        </div>
      </div>
      {incident.pr_url && (
        <div className="flex flex-wrap items-center gap-2"><a href={incident.pr_url} target="_blank" rel="noreferrer" data-testid="link-draft-pr"
          className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-sm">
          <GitPullRequest className="size-4" />{merged ? "View Merged PR on GitHub" : outcome?.state === "draft" || (!outcome && incident.status === "draft_pr_opened") ? "View Draft PR on GitHub" : "View PR on GitHub"}<ExternalLink className="size-3.5" />
        </a>
          {!merged && <button type="button" disabled={pr.isPending} data-testid="button-refresh-pr"
            className="text-xs text-zinc-400 underline underline-offset-4 disabled:opacity-50"
            onClick={() => pr.mutate({ id: incident.id, data: { mode: "manual", confirm_auto_merge: false } }, { onSuccess: refresh })}>
            Refresh GitHub status
          </button>}
        </div>
      )}
      {canAct && (
        <button onClick={openPr} disabled={pr.isPending || (auto && !authorized) || closed || missingTest || wrongBase || !incident.diagnosis.original_code_snippet || incident.diagnosis.original_code_snippet === incident.diagnosis.patched_code_snippet}
          data-testid="button-create-pr" className={`w-full flex justify-center items-center gap-2 rounded-md text-zinc-950 px-3 py-3 font-medium text-sm disabled:opacity-40 ${auto ? "bg-amber-400 hover:bg-amber-300 shadow-[0_0_16px_#fbbf2420]" : "bg-cyan-500 hover:bg-cyan-400"}`}>
          {pr.isPending ? <Loader2 className="size-4 animate-spin" /> : <GitPullRequest className="size-4" />}
          {pr.isPending ? auto ? "Checking PR & requesting merge…" : "Creating guarded draft PR…" : auto ? incident.pr_url ? "Confirm & Retry Auto-Merge" : "Create PR & Auto-Merge to main" : incident.pr_url ? "Refresh PR Status" : "Open Draft PR on GitHub (Human Verification Guardrail)"}
        </button>
      )}
      {auto && !authorized && <div className="text-xs text-amber-200 space-y-1" data-testid="text-merge-authorization">
        <p>{access.isPending ? "Verifying merge administrator access…" : access.data?.reason || "Merge authorization could not be verified. No merge is permitted."}</p>
        {access.data?.signed_in === false && <Link href="/sign-in" data-testid="link-merge-sign-in" className="underline underline-offset-4 text-cyan-300">Sign in for Auto-Merge</Link>}
        {access.data?.user_id && <p className="font-mono break-all text-zinc-400">Your account ID: {access.data.user_id}. The workspace owner must grant access for {incident.repository} using the operator-only merge-admin command.</p>}
      </div>}
      {missingTest && <p className="text-xs text-amber-200">Re-analyze to generate a regression test before Auto-Merge.</p>}
      {wrongBase && <p className="text-xs text-amber-200">Auto-Merge supports main only. This incident targets {incident.branch}; use Manual Review.</p>}
      {outcome?.validation === "simulated" && <p data-testid="text-pr-validation" className="font-mono text-xs text-amber-200">SIMULATED VALIDATION ONLY · tests NOT executed · no passing CI check created</p>}
      {outcome?.error && <p role="alert" data-testid="text-pr-outcome-error" className="text-xs text-rose-300">{outcome.error}</p>}
      {pr.isError && <p role="alert" className="text-xs text-rose-300">{errMsg(pr.error)}</p>}
    </div>
  );
}
