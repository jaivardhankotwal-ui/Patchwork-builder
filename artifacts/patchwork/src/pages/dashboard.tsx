import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Activity, AlertCircle, CheckCircle2, FileCode2, FlaskConical, GitBranch, Github, Loader2, Play, RefreshCw, RotateCcw, Search, Sparkles, Terminal, X,
} from "lucide-react";
import {
  useGetConfig, getGetConfigQueryKey, useListIncidents, getListIncidentsQueryKey, useGetSummary, getGetSummaryQueryKey,
  useSimulateIncident, useAnalyzeIncident, useUpdateIncident, type Incident,
  useSimulateSentryWebhook, useListWebhookJobs, getListWebhookJobsQueryKey,
} from "@workspace/api-client-react";
import { DiagnosisCard } from "@/components/diagnosis-card";
import { DiagnosticTerminal, extractTracePath, type TerminalRun } from "@/components/diagnostic-terminal";
import { errMsg, fmtSec } from "@/lib/diff";

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const LS = "patchwork.config";

function Dot({ ok }: { ok: boolean }) {
  return <span className={`size-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-400"}`} />;
}

export default function Dashboard() {
  const qc = useQueryClient();
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } }, []);
  const [repo, setRepo] = useState<string>(saved.repository ?? "");
  const [branch, setBranch] = useState<string>(saved.branch ?? "main");
  useEffect(() => { localStorage.setItem(LS, JSON.stringify({ repository: repo, branch })); }, [repo, branch]);

  const [trace, setTrace] = useState("");
  const [simulated, setSimulated] = useState(false);
  const [simPath, setSimPath] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<number | null>(null);
  const runSeq = useRef(0);
  const [termRun, setTermRun] = useState<TerminalRun | null>(null);
  const [termOpen, setTermOpen] = useState(false);
  const [flash, setFlash] = useState<{ run: number; incidentId: number } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const timeout = window.setTimeout(() => setFlash(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [flash]);

  const config = useGetConfig({ query: { queryKey: getGetConfigQueryKey(), refetchInterval: 30000 } });
  const incidents = useListIncidents({ query: { queryKey: getListIncidentsQueryKey(), refetchInterval: 15000 } });
  const summary = useGetSummary({ query: { queryKey: getGetSummaryQueryKey(), refetchInterval: 15000 } });
  const simulate = useSimulateIncident();
  const analyze = useAnalyzeIncident();
  const update = useUpdateIncident();
  const webhook = useSimulateSentryWebhook();
  const jobs = useListWebhookJobs({ query: { queryKey: getListWebhookJobsQueryKey(), refetchInterval: 10000 } });
  const [live, setLive] = useState(false);
  useEffect(() => {
    const events = new EventSource(`${import.meta.env.BASE_URL}api/events`);
    const refresh = () => {
      qc.invalidateQueries({ queryKey: getListIncidentsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
      qc.invalidateQueries({ queryKey: getListWebhookJobsQueryKey() });
    };
    events.onopen = () => { setLive(true); refresh(); };
    events.onerror = () => setLive(false);
    events.addEventListener("incidents", refresh);
    return () => events.close();
  }, [qc]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListIncidentsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
  };

  const repoValid = REPO_RE.test(repo.trim());
  const branchValid = branch.trim().length > 0 && branch.length <= 250;
  const traceValid = trace.trim().length >= 10 && trace.length <= 50000;

  const runSimulate = () => {
    simulate.mutate({ data: { repository: repo.trim(), branch: branch.trim() } }, {
      onSuccess: (s) => { setTrace(s.stack_trace); setSimulated(true); setSimPath(s.file_path); },
    });
  };

  const runAnalyze = () => {
    setElapsed(0);
    if (timer.current) window.clearInterval(timer.current);
    const runId = ++runSeq.current;
    setTermRun({ id: runId, repo: repo.trim(), branch: branch.trim(), tracePath: extractTracePath(trace), traceLines: trace.split("\n").filter(Boolean).length, status: "pending" });
    setTermOpen(true);
    const start = performance.now();
    timer.current = window.setInterval(() => setElapsed((performance.now() - start) / 1000), 100);
    analyze.mutate({ data: { repository: repo.trim(), branch: branch.trim(), stack_trace: trace, simulated } }, {
      onSuccess: (inc) => {
        if (runSeq.current !== runId) return;
        setSelectedId(inc.id); invalidate();
        setTermRun((r) => r && r.id === runId ? { ...r, status: "success", elapsed: inc.elapsed_seconds, filePath: inc.diagnosis.file_path } : r);
        setFlash({ run: runId, incidentId: inc.id });
      },
      onError: (e) => { if (runSeq.current === runId) setTermRun((r) => r && r.id === runId ? { ...r, status: "error", error: errMsg(e) } : r); },
      onSettled: () => { if (runSeq.current === runId && timer.current) window.clearInterval(timer.current); },
    });
  };
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const setStatus = (inc: Incident) => {
    update.mutate({ id: inc.id, data: { status: inc.status !== "resolved" ? "resolved" : "active" } }, { onSuccess: invalidate });
  };

  const list = incidents.data ?? [];
  const selected = list.find((i) => i.id === selectedId) ?? (analyze.data && analyze.data.id === selectedId ? analyze.data : null);
  const cfg = config.data;

  return (
    <div className="relative z-10 min-h-[100dvh]">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-[hsl(222_22%_6%/0.85)] backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-orange-500 grid place-items-center text-zinc-950 font-mono text-[11px] font-bold">pw</div>
            <span className="font-semibold tracking-tight">Patchwork</span>
            <span className="hidden sm:inline text-xs text-zinc-500">incident → evidence → patch</span>
          </div>
          <div className="ml-auto flex items-center gap-4 text-[11px] font-mono" data-testid="status-config">
            {config.isLoading ? <span className="h-3 w-56 rounded bg-zinc-800 animate-pulse" /> : config.isError ? (
              <button onClick={() => config.refetch()} className="flex items-center gap-1 text-rose-300"><AlertCircle className="size-3" />config unavailable · retry</button>
            ) : cfg && (
              <>
                <span className="hidden md:flex items-center gap-3 text-zinc-500">
                  <span className="text-zinc-600">env</span>
                  {([["GITHUB_TOKEN", cfg.github_token], ["GEMINI_API_KEY", cfg.gemini_api_key], ["SLACK_WEBHOOK_URL", cfg.slack_webhook_url]] as const).map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1.5" data-testid={`status-env-${k}`} title={v ? "set" : "missing"}><Dot ok={v} />{k}</span>
                  ))}
                </span>
                <span className="flex items-center gap-3 text-zinc-500 md:border-l border-zinc-800 md:pl-4">
                  <span className="text-zinc-600">link</span>
                  <span className="flex items-center gap-1.5" data-testid="status-github-connected"><Dot ok={cfg.github_connected} />github</span>
                  <span className="flex items-center gap-1.5" data-testid="status-gemini-connected"><Dot ok={cfg.gemini_connected} />gemini</span>
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 rounded-xl border border-zinc-800 bg-zinc-900/40 divide-x divide-zinc-800 overflow-hidden">
          {[
            { k: "Total incidents", v: summary.data?.total, c: "text-zinc-100" },
            { k: "Active", v: summary.data?.active, c: "text-orange-300" },
            { k: "Resolved", v: summary.data?.resolved, c: "text-emerald-300" },
            { k: "Avg time to diagnose", v: summary.data ? (summary.data.total ? fmtSec(summary.data.average_seconds) : "—") : undefined, c: "text-zinc-100" },
          ].map((s, i) => (
            <div key={s.k} className={`px-4 py-3 ${i >= 2 ? "border-t md:border-t-0 border-zinc-800" : ""}`}>
              <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{s.k}</div>
              {summary.isLoading ? <div className="mt-2 h-6 w-12 rounded bg-zinc-800 animate-pulse" /> :
                summary.isError ? <button onClick={() => summary.refetch()} className="mt-1 text-xs text-rose-300">retry</button> :
                <div className={`mt-1 text-2xl font-mono tabular-nums ${s.c}`} data-testid={`text-summary-${i}`}>{s.v}</div>}
            </div>
          ))}
        </div>

        <div className="grid xl:grid-cols-[440px_1fr] gap-6 items-start">
          {/* Ingest */}
          <section className={`rounded-xl border border-zinc-800 bg-zinc-900/50 xl:sticky xl:top-20 ${analyze.isPending ? "pw-active-card" : ""}`}>
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 text-sm">
              <span className="font-mono text-[11px] text-orange-400">01</span><span className="font-medium">Ingest incident</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <label className="space-y-1">
                  <span className="flex items-center gap-1 text-[11px] text-zinc-500"><Github className="size-3" />Repository</span>
                  <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" data-testid="input-repository"
                    className={`w-full h-9 px-2.5 rounded-md bg-zinc-950 border font-mono text-sm outline-none focus:border-orange-500/60 ${repo && !repoValid ? "border-rose-500/60" : "border-zinc-800"}`} />
                </label>
                <label className="space-y-1">
                  <span className="flex items-center gap-1 text-[11px] text-zinc-500"><GitBranch className="size-3" />Branch</span>
                  <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" data-testid="input-branch"
                    className="w-full h-9 px-2.5 rounded-md bg-zinc-950 border border-zinc-800 font-mono text-sm outline-none focus:border-orange-500/60" />
                </label>
              </div>
              {repo && !repoValid && <p className="text-[11px] text-rose-300 -mt-2">Use owner/repo format, e.g. octocat/Hello-World</p>}

              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <div className="flex items-center justify-between h-9 px-2 bg-zinc-950/60 border-b border-zinc-800">
                  <span className="flex items-center gap-1.5 text-xs text-zinc-300 px-1.5 py-1 rounded bg-zinc-800/80"><Terminal className="size-3" />Crash log / stack trace</span>
                  <button onClick={runSimulate} disabled={!repoValid || !branchValid || simulate.isPending} data-testid="button-simulate"
                    className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded text-orange-300 hover:bg-orange-500/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
                    {simulate.isPending ? <Loader2 className="size-3 animate-spin" /> : <FlaskConical className="size-3" />}Simulate Sentry webhook
                  </button>
                </div>
                {simulated && (
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] bg-orange-500/[0.07] border-b border-orange-500/20 text-orange-200">
                    <span className="truncate">Simulated trace · synthetic error against real file <span className="font-mono">{simPath}</span></span>
                    <button onClick={() => { setSimulated(false); setSimPath(null); setTrace(""); }} className="shrink-0 text-orange-300/70 hover:text-orange-200" data-testid="button-clear-simulation"><X className="size-3" /></button>
                  </div>
                )}
                <textarea value={trace} onChange={(e) => setTrace(e.target.value)} spellCheck={false} data-testid="input-stack-trace"
                  placeholder={"Traceback (most recent call last):\n  File \"app/handlers.py\", line 42, in handle\n    ...\nKeyError: 'user_id'"}
                  className="block w-full h-64 p-3 bg-zinc-950 font-mono text-[12px] leading-relaxed text-zinc-300 placeholder:text-zinc-700 outline-none resize-y scroll-thin" />
                <div className="flex justify-between px-3 py-1 text-[10px] font-mono text-zinc-600 bg-zinc-950 border-t border-zinc-900">
                  <span>{trace.split("\n").filter(Boolean).length} lines</span><span>{trace.length.toLocaleString()} / 50,000</span>
                </div>
              </div>
              {simulate.isError && <ErrorLine msg={`Simulation failed: ${errMsg(simulate.error)}. Check the repository exists and GITHUB_TOKEN has access.`} onRetry={runSimulate} />}

              <button onClick={runAnalyze} disabled={!repoValid || !branchValid || !traceValid || analyze.isPending} data-testid="button-analyze"
                className="pw-cta relative w-full h-11 rounded-lg bg-orange-500 text-zinc-950 font-medium text-sm flex items-center justify-center gap-2 overflow-hidden hover:bg-orange-400 active:scale-[0.99] disabled:bg-zinc-800 disabled:text-zinc-500 transition-[background-color,transform]">
                {analyze.isPending ? (
                  <>
                    <span className="absolute inset-y-0 left-0 w-1/3 bg-white/20 scan" />
                    <Loader2 className="size-4 animate-spin" />Diagnosing
                    <span className="font-mono tabular-nums" data-testid="text-live-timer">{elapsed.toFixed(1)}s</span>
                  </>
                ) : (<><Sparkles className="size-4" />Analyze &amp; diagnose incident</>)}
              </button>
              {termRun && <DiagnosticTerminal run={termRun} open={termOpen} onToggle={() => setTermOpen((o) => !o)} />}
              {!analyze.isPending && analyze.isSuccess && <p className="text-[11px] text-emerald-300 text-center font-mono">Last run finished in {elapsed.toFixed(1)}s</p>}
              {analyze.isError && <ErrorLine msg={`Analysis failed: ${errMsg(analyze.error)}`} onRetry={runAnalyze} />}
              {cfg && (!cfg.github_connected || !cfg.gemini_connected) && (
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  {!cfg.github_connected && "GitHub is not connected — file fetches will fail. "}
                  {!cfg.gemini_connected && "Gemini is not connected — diagnosis cannot run."}
                </p>
              )}
              <div className="border-t border-zinc-800 pt-3 space-y-2">
                <p className="text-xs text-zinc-300">Live Sentry webhook · <span className={live ? "text-emerald-300" : "text-orange-300"}>{live ? "live updates" : "polling fallback"}</span></p>
                <code className="block text-[11px] text-zinc-500 break-all">POST /api/webhooks/sentry</code>
                <p className="text-[11px] text-zinc-500">{cfg?.sentry_webhook_configured ? "External deliveries require a valid Sentry signature." : "External receiver disabled: SENTRY_WEBHOOK_SECRET is not configured."}</p>
                <button data-testid="button-submit-webhook" disabled={!repoValid || !branchValid || !traceValid || webhook.isPending}
                  onClick={() => webhook.mutate({ data: { repository: repo.trim(), branch: branch.trim(), stack_trace: trace, simulated: true } }, {
                    onSuccess: () => qc.invalidateQueries({ queryKey: getListWebhookJobsQueryKey() }),
                  })}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-orange-500/30 text-orange-300 hover:bg-orange-500/10 disabled:opacity-40">
                  {webhook.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
                  Send simulated webhook & diagnose
                </button>
                <p className="text-[11px] text-zinc-500">Queues this trace as a simulation. Uses the same diagnosis pipeline and may spend AI credits.</p>
                {webhook.isError && <ErrorLine msg={errMsg(webhook.error)} />}
                {webhook.data && <p role="status" className="text-xs text-emerald-300">Webhook job #{webhook.data.id} accepted. Follow its progress below.</p>}
              </div>
            </div>
          </section>

          {/* Diagnosis */}
          <div className="space-y-6 min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-[11px] text-orange-400">02</span><span className="font-medium">Diagnosis</span>
            </div>
            {analyze.isPending ? (
              <div className="pw-active-card rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
                {["Parsing stack frames", "Fetching file and last 5 commits from GitHub", "Asking Gemini for root cause and patch"].map((s, i) => (
                  <div key={s} className="flex items-center gap-3 text-sm text-zinc-400">
                    <span className={`size-1.5 rounded-full ${elapsed > i * 3 ? "bg-orange-400 animate-pulse" : "bg-zinc-700"}`} />{s}
                  </div>
                ))}
                <div className="h-40 rounded-lg bg-zinc-800/40 animate-pulse" />
              </div>
            ) : selected ? (
              <div key={selected.id}
                className={flash && flash.incidentId === selected.id ? "pw-success-flash" : undefined}>
                <DiagnosisCard key={selected.id} incident={selected} onToggleStatus={() => setStatus(selected)} updating={update.isPending} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-14 text-center">
                <FileCode2 className="size-6 mx-auto text-zinc-600" />
                <p className="mt-3 text-sm text-zinc-300">No diagnosis selected</p>
                <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">Paste a stack trace and run analysis, or pick an incident from history below.</p>
              </div>
            )}
            {update.isError && <ErrorLine msg={`Status update failed: ${errMsg(update.error)}`} />}
            {(jobs.isError || !!jobs.data?.length) && (
              <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2" data-testid="webhook-jobs">
                <h3 className="text-sm font-medium">Webhook activity</h3>
                {jobs.isError && <ErrorLine msg={errMsg(jobs.error)} onRetry={() => { void jobs.refetch(); }} />}
                {jobs.data?.map(job => (
                  <div key={job.id} className="text-xs border-t border-zinc-800 pt-2 flex flex-wrap justify-between gap-2">
                    <span className="text-zinc-400">#{job.id} · {job.repository} · <span className={job.status === "failed" ? "text-rose-300" : "text-orange-300"}>{job.status}</span></span>
                    {job.incident_id && <button className="text-emerald-300 underline" onClick={() => setSelectedId(job.incident_id)}>View diagnosis</button>}
                    {job.error && <p role="alert" className="w-full text-rose-300">{job.error}</p>}
                  </div>
                ))}
              </section>
            )}

            <History list={list} loading={incidents.isLoading} error={incidents.isError ? errMsg(incidents.error) : null}
              onRetry={() => incidents.refetch()} fetching={incidents.isFetching}
              selectedId={selectedId} onSelect={setSelectedId} onToggle={setStatus} updatingId={update.isPending ? update.variables?.id : undefined} />
          </div>
        </div>
      </main>
    </div>
  );
}

function ErrorLine({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-200" data-testid="text-error">
      <AlertCircle className="size-3.5 mt-px shrink-0 text-rose-400" /><span className="flex-1">{msg}</span>
      {onRetry && <button onClick={onRetry} className="shrink-0 text-rose-300 hover:text-rose-100 underline underline-offset-2">Retry</button>}
    </div>
  );
}

function History(p: {
  list: Incident[]; loading: boolean; error: string | null; onRetry: () => void; fetching: boolean;
  selectedId: number | null; onSelect: (id: number) => void; onToggle: (i: Incident) => void; updatingId?: number;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return p.list
      .filter((i) => filter === "all" || (filter === "active" ? i.status !== "resolved" : i.status === filter))
      .filter((i) => !s || [i.repository, i.error_type, i.diagnosis.file_path, i.diagnosis.root_cause_summary, i.diagnosis.suspect_author ?? ""].some((f) => f.toLowerCase().includes(s)))
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [p.list, q, filter]);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-zinc-800">
        <span className="font-mono text-[11px] text-orange-400">03</span>
        <span className="text-sm font-medium">Resolved &amp; active incidents</span>
        {p.fetching && !p.loading && <RefreshCw className="size-3 text-zinc-600 animate-spin" />}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" data-testid="input-search"
              className="h-8 w-44 pl-7 pr-2 rounded-md bg-zinc-950 border border-zinc-800 text-xs outline-none focus:border-orange-500/60" />
          </div>
          <div className="flex rounded-md border border-zinc-800 p-0.5 bg-zinc-950 text-[11px]">
            {(["all", "active", "resolved"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} data-testid={`button-filter-${f}`}
                className={`px-2 py-1 rounded capitalize transition-colors ${filter === f ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>{f}</button>
            ))}
          </div>
        </div>
      </div>
      {p.loading ? (
        <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-9 rounded bg-zinc-800/50 animate-pulse" />)}</div>
      ) : p.error ? (
        <div className="p-4"><ErrorLine msg={`Could not load incidents: ${p.error}`} onRetry={p.onRetry} /></div>
      ) : p.list.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <Activity className="size-5 mx-auto text-zinc-600" />
          <p className="mt-2 text-sm text-zinc-300">No incidents yet</p>
          <p className="text-xs text-zinc-500">Analyzed incidents are stored here.</p>
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-zinc-500">No incidents match this search or filter.</p>
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 text-left">
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-2 font-normal">ID</th><th className="px-2 py-2 font-normal">Error</th>
                <th className="px-2 py-2 font-normal">Repository / file</th><th className="px-2 py-2 font-normal">Commit</th>
                <th className="px-2 py-2 font-normal text-right">Conf.</th><th className="px-2 py-2 font-normal text-right">Time</th>
                <th className="px-2 py-2 font-normal">Opened</th><th className="px-4 py-2 font-normal text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} onClick={() => p.onSelect(i.id)} data-testid={`row-incident-${i.id}`}
                  className={`border-b border-zinc-800/60 cursor-pointer transition-colors ${p.selectedId === i.id ? "bg-orange-500/[0.06]" : "hover:bg-zinc-800/30"}`}>
                  <td className={`px-4 py-2.5 font-mono text-zinc-500 border-l-2 ${p.selectedId === i.id ? "border-orange-500" : "border-transparent"}`}>{i.id}</td>
                  <td className="px-2 py-2.5"><span className="font-mono text-rose-300">{i.error_type}</span>{i.simulated && <span className="ml-1.5 text-[10px] text-orange-300/80">sim</span>}</td>
                  <td className="px-2 py-2.5 max-w-[260px]"><div className="truncate text-zinc-300">{i.repository}<span className="text-zinc-600">@{i.branch}</span></div><div className="truncate font-mono text-zinc-500">{i.diagnosis.file_path}</div></td>
                  <td className="px-2 py-2.5 font-mono text-zinc-400">{i.diagnosis.suspect_commit_sha?.slice(0, 7) ?? "—"}</td>
                  <td className="px-2 py-2.5 font-mono text-right tabular-nums text-zinc-300">{Math.round(i.diagnosis.confidence_score)}%</td>
                  <td className="px-2 py-2.5 font-mono text-right tabular-nums text-zinc-300">{fmtSec(i.elapsed_seconds)}</td>
                  <td className="px-2 py-2.5 text-zinc-500 whitespace-nowrap">{formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={(e) => { e.stopPropagation(); p.onToggle(i); }} disabled={p.updatingId === i.id} data-testid={`button-status-${i.id}`}
                      title={i.status !== "resolved" ? "Mark resolved (manual)" : "Reopen"}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded border transition-colors disabled:opacity-50 ${i.status === "active" ? "border-orange-500/30 text-orange-300 hover:bg-orange-500/10" : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"}`}>
                      {p.updatingId === i.id ? <Loader2 className="size-3 animate-spin" /> : i.status === "active" ? <Play className="size-3" /> : <CheckCircle2 className="size-3" />}
                      {i.status === "draft_pr_opened" ? "Draft PR Opened" : i.status}
                      {i.status === "resolved" && <RotateCcw className="size-3 opacity-50" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
