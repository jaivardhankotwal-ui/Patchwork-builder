import { useState } from "react";
import { AlertTriangle, Check, Clock, Copy, Download, ExternalLink, GitCommit, RotateCcw, ShieldAlert, User, CheckCircle2, FlaskConical, Send, Loader2 } from "lucide-react";
import { useSendIncidentSlack, getListIncidentsQueryKey, getGetSummaryQueryKey, type Incident } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { DiffViewer } from "./diff-viewer";
import { fmtSec, errMsg } from "@/lib/diff";
import { Typewriter } from "@/components/motion/typewriter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IncidentPrActions } from "./incident-pr-actions";
import { isMerged, prStatusLabel, type AutonomyMode } from "@/lib/pr-status";

export function DiagnosisCard({ incident, mode, onToggleStatus, updating }: { incident: Incident; mode: AutonomyMode; onToggleStatus: () => void; updating: boolean }) {
  const d = incident.diagnosis;
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();
  const slack = useSendIncidentSlack();
  const refresh = (updated: Incident) => {
    qc.setQueryData<Incident[]>(getListIncidentsQueryKey(), list => list?.map(i => i.id === updated.id ? updated : i));
    qc.invalidateQueries({ queryKey: getListIncidentsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
  };
  const conf = Math.max(0, Math.min(100, Math.round(d.confidence_score)));
  const confTone = conf >= 75 ? "bg-emerald-400" : conf >= 45 ? "bg-cyan-400" : "bg-rose-400";

  const copy = async () => {
    await navigator.clipboard.writeText(d.full_patched_file);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const download = () => {
    const blob = new Blob([d.full_patched_file], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = d.file_path.split("/").pop() || "patched.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rise pw-glass rounded-xl overflow-hidden" data-testid={`card-diagnosis-${incident.id}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono text-[11px] text-zinc-500">INC-{String(incident.id).padStart(4, "0")}</span>
          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20" data-testid="text-error-type">{incident.error_type}</span>
          {incident.simulated && (
            <span className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-300 bg-cyan-500/10"><FlaskConical className="size-3" />Simulated trace</span>
          )}
          <span className={`text-[11px] px-1.5 py-0.5 rounded border ${incident.status === "active" ? "border-cyan-500/30 text-cyan-300" : "border-emerald-500/30 text-emerald-300"}`} data-testid="status-incident">
            {prStatusLabel(incident)}
          </span>
        </div>
        <button onClick={onToggleStatus} disabled={updating || isMerged(incident)} data-testid="button-toggle-status"
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50 transition-colors">
          {incident.status !== "resolved" ? <CheckCircle2 className="size-3.5" /> : <RotateCcw className="size-3.5" />}
          {isMerged(incident) ? "Merged" : incident.status !== "resolved" ? "Mark resolved" : "Reopen"}
        </button>
      </header>

      <div className="grid lg:grid-cols-[1fr_280px] gap-0">
        <div className="p-5 space-y-2 lg:border-r border-zinc-800">
          <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Root cause</div>
          <p className="text-[15px] leading-relaxed text-zinc-200" data-testid="text-root-cause"><Typewriter text={d.root_cause_summary} maxMs={1200} /></p>
        </div>
        <dl className="p-5 space-y-3.5 text-sm border-t lg:border-t-0 border-zinc-800">
          <div>
            <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-zinc-500 mb-1"><GitCommit className="size-3" />Suspect commit</dt>
            <dd data-testid="text-suspect-commit">
              {d.suspect_commit_sha ? (
                <a href={`https://github.com/${incident.repository}/commit/${d.suspect_commit_sha}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-cyan-300 hover:text-cyan-200 underline-offset-4 hover:underline">
                  {d.suspect_commit_sha.slice(0, 10)}<ExternalLink className="size-3" />
                </a>
              ) : <span className="text-zinc-500">Not identified</span>}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-zinc-500 mb-1"><User className="size-3" />Author</dt>
            <dd className="text-zinc-300" data-testid="text-suspect-author">{d.suspect_author ?? <span className="text-zinc-500">Not identified</span>}</dd>
          </div>
          <div className="flex gap-6">
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-zinc-500 mb-1"><Clock className="size-3" />Diagnosed in</dt>
              <dd className="font-mono text-zinc-100 tabular-nums" data-testid="text-elapsed">{fmtSec(incident.elapsed_seconds)}</dd>
            </div>
            <div className="flex-1">
              <dt className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 mb-1">Confidence</dt>
              <dd className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-zinc-100" data-testid="text-confidence">{conf}%</span>
                <span className="flex-1 h-1 rounded bg-zinc-800 overflow-hidden"><span className={`block h-full ${confTone}`} style={{ width: `${conf}%` }} /></span>
              </dd>
            </div>
          </div>
        </dl>
      </div>

      <div className="px-5 pb-5 space-y-3">
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 text-xs text-amber-200/90">
          <ShieldAlert className="size-4 shrink-0 text-amber-400 mt-px" />
          <div className="space-y-1">
            <p className="font-medium text-amber-200">AI-generated patch — not compiled, tested, or verified. Review before committing.</p>
            {d.warnings.map((w, i) => (
              <p key={i} className="flex gap-1.5 text-amber-200/75" data-testid={`text-warning-${i}`}><AlertTriangle className="size-3 mt-0.5 shrink-0" />{w}</p>
            ))}
          </div>
        </div>
        <Tabs defaultValue="diff" className="min-w-0">
          <TabsList aria-label="Proposed changes" className="bg-zinc-950 border border-zinc-800">
            <TabsTrigger value="diff">Code diff</TabsTrigger>
            <TabsTrigger value="test" data-testid="tab-regression-test">Regression test</TabsTrigger>
          </TabsList>
          <TabsContent value="diff">
            <DiffViewer original={d.original_code_snippet} patched={d.patched_code_snippet} filePath={d.file_path} />
          </TabsContent>
          <TabsContent value="test" className="space-y-3">
            {d.regression_test ? (
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <div className="p-3 bg-zinc-900 space-y-2 text-xs">
                  <p className="font-mono text-emerald-300 break-all">{d.regression_test.file_path}</p>
                  <p className="text-zinc-300 whitespace-pre-wrap">{d.regression_test.description}</p>
                  <p className="text-cyan-300">AI-generated · not run or verified. Review before execution.</p>
                  <p className="text-zinc-500">Suggested command:</p>
                  <code className="block text-zinc-300 whitespace-pre-wrap break-all">{d.regression_test.run_command}</code>
                </div>
                <pre data-testid="code-regression-test" className="pw-scan-once relative p-4 max-h-[500px] overflow-auto text-xs font-mono text-emerald-200 bg-zinc-950"><code>{d.regression_test.content}</code></pre>
              </div>
            ) : <p className="p-4 text-sm text-zinc-400 border border-dashed border-zinc-800 rounded-lg">No regression test was saved with this diagnosis. Re-analyze the incident to generate a fix and its edge-case test.</p>}
          </TabsContent>
        </Tabs>
        <IncidentPrActions incident={incident} mode={mode} refresh={refresh} />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => slack.mutate({ id: incident.id }, { onSuccess: refresh })} disabled={slack.isPending}
              data-testid="button-send-slack" className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border border-zinc-700 hover:border-zinc-500 disabled:opacity-50">
              {slack.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}Send to Slack
            </button>
            <span data-testid="text-slack-status" className={`text-xs ${incident.slack_status === "sent" ? "text-emerald-300" : "text-zinc-400"}`}>
              {incident.slack_status === "sent" ? "Slack alert sent" : incident.slack_status === "failed" ? "Slack delivery failed" : incident.slack_status === "not_configured" ? "Slack not configured" : "Slack alert not sent"}
            </span>
          </div>
          {incident.slack_error && <p role="status" className="text-xs text-cyan-200">{incident.slack_error}</p>}
          {slack.isError && <p role="alert" className="text-xs text-rose-300">{errMsg(slack.error)}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-zinc-500">Full patched file: <span className="font-mono text-zinc-400">{d.file_path}</span> · {d.full_patched_file.split("\n").length} lines</span>
          <div className="flex gap-2">
            <button onClick={copy} data-testid="button-copy-file"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-200 hover:border-zinc-500 transition-colors">
              {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy file"}
            </button>
            <button onClick={download} data-testid="button-download-file"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-cyan-500 text-zinc-950 font-medium hover:bg-cyan-400 transition-colors">
              <Download className="size-3.5" />Download
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
