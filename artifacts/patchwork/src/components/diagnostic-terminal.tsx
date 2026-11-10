import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, TerminalSquare } from "lucide-react";
import { fmtSec } from "@/lib/diff";
import { Typewriter } from "@/components/motion/typewriter";
import "./diagnostic-terminal.css";

export type TerminalRun = {
  id: number;
  repo: string;
  branch: string;
  tracePath: string | null;
  traceLines: number;
  status: "pending" | "success" | "error";
  elapsed?: number;
  filePath?: string;
  error?: string;
};

export function extractTracePath(trace: string): string | null {
  const py = [...trace.matchAll(/File "([^"]+)"/g)].map((m) => m[1]);
  if (py.length) return py[py.length - 1];
  const m = trace.match(/([\w./-]+\.(?:py|js|jsx|ts|tsx|go|rb|java|kt|php|rs|cs))/);
  return m ? m[1] : null;
}

function steps(r: TerminalRun): [string, string][] {
  return [
    ["SYS", `ingest trace · ${r.traceLines} lines · ${r.repo}@${r.branch}`],
    ["GIT", `traverse relevant file -> ${r.tracePath ?? "path resolved server-side"}`],
    ["GIT", "request file contents + recent commit history"],
    ["AI ", "query Gemini 2.5 Flash for root cause + patch"],
    ["SEC", "validate human-in-loop guardrails · draft PR only, no merge"],
  ];
}

function TerminalLog({ run }: { run: TerminalRun }) {
  const steps_ = useMemo(() => steps(run), [run.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [idx, setIdx] = useState(0); // index of line currently typing
  const logRef = useRef<HTMLDivElement>(null);
  const done = run.status !== "pending";
  const final: [string, string, string] | null = run.status === "success"
    ? ["OK ", `root cause identified in ${fmtSec(run.elapsed ?? NaN)} · ${run.filePath ?? ""}`, "ok"]
    : run.status === "error" ? ["ERR", run.error ?? "analysis failed", "err"] : null;
  const all: [string, string, string][] = [...steps_.map(([t, m]) => [t, m, "step"] as [string, string, string]), ...(final ? [final] : [])];
  const visible = all.slice(0, idx + 1);

  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; });

  return (
    <div ref={logRef} className="pwt-log scroll-thin" role="log" aria-live="polite" aria-label="Simulated diagnostic stream">
      <div className="pwt-line pwt-dim"># illustrative steps, not backend telemetry</div>
      {visible.map(([tag, msg, kind], i) => (
        <div key={i} className="pwt-line" data-testid={kind === "ok" ? "text-terminal-ok" : kind === "err" ? "text-terminal-err" : undefined}>
          <span className={kind === "ok" ? "pwt-tag-ok" : kind === "err" ? "pwt-tag-err" : "pwt-tag"}>[{tag}]</span>{" "}
          <Typewriter text={msg} cps={done ? 1600 : 520} maxMs={done ? 500 : 1100} cursor={i === idx}
            onDone={() => window.setTimeout(() => setIdx((v) => Math.max(v, i + 1)), done ? 40 : 220)} />
        </div>
      ))}
      {!done && idx >= all.length && <div className="pwt-line pwt-dim">... awaiting backend response<span className="pw-cursor" /></div>}
      {run.status === "error" && <span className="sr-only" role="alert">Analysis failed: {run.error}</span>}
    </div>
  );
}

export function DiagnosticTerminal({ run, open, onToggle }: { run: TerminalRun; open: boolean; onToggle: () => void }) {
  return (
    <div className="pwt" data-testid="terminal-diagnostic">
      <button type="button" className="pwt-head" onClick={onToggle} aria-expanded={open} aria-controls={`pwt-body-${run.id}`} data-testid="button-toggle-terminal">
        <TerminalSquare className="size-3.5" />
        <span>diagnostic stream</span>
        <span className="pwt-badge">SIMULATED</span>
        {run.status === "pending" && <span className="pwt-live" aria-hidden="true" />}
        <span className="ml-auto pwt-dim">{run.status === "pending" ? "running" : run.status === "success" ? "ok" : "err"}</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className="pwt-body" id={`pwt-body-${run.id}`} data-open={open} inert={!open}>
        <div><TerminalLog key={run.id} run={run} /></div>
      </div>
    </div>
  );
}
