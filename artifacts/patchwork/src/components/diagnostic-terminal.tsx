import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, TerminalSquare } from "lucide-react";
import { fmtSec } from "@/lib/diff";
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

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function steps(r: TerminalRun): [string, string][] {
  return [
    ["SYS", `ingest trace · ${r.traceLines} lines · ${r.repo}@${r.branch}`],
    ["GIT", `traverse relevant file -> ${r.tracePath ?? "path resolved server-side"}`],
    ["GIT", "request file contents + recent commit history"],
    ["AI ", "query Gemini 2.5 Flash for root cause + patch"],
    ["SEC", "validate human-in-loop guardrails · draft PR only, no merge"],
  ];
}

export function DiagnosticTerminal({ run, open, onToggle }: { run: TerminalRun; open: boolean; onToggle: () => void }) {
  const lines = useMemo(() => steps(run), [run.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [shown, setShown] = useState(0); // fully shown lines
  const [chars, setChars] = useState(0); // chars of current line
  const logRef = useRef<HTMLDivElement>(null);
  const done = run.status !== "pending";

  // Reset per run
  useEffect(() => { setShown(reduced() ? lines.length : 0); setChars(0); }, [run.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typewriter while pending; stops on completion/unmount
  useEffect(() => {
    if (done || shown >= lines.length) return;
    const text = `[${lines[shown][0]}] ${lines[shown][1]}`;
    if (chars >= text.length) {
      const t = window.setTimeout(() => { setShown((s) => s + 1); setChars(0); }, 380);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setChars((c) => c + 2), 16);
    return () => window.clearTimeout(t);
  }, [done, shown, chars, lines]);

  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [shown, chars, run.status]);

  const visible = done ? lines.length : shown;
  const partial = !done && shown < lines.length ? `[${lines[shown][0]}] ${lines[shown][1]}`.slice(0, chars) : null;

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
        <div>
          <div ref={logRef} className="pwt-log scroll-thin" role="log" aria-live="polite" aria-label="Simulated diagnostic stream">
            <div className="pwt-line pwt-dim"># illustrative steps, not backend telemetry</div>
            {lines.slice(0, visible).map(([tag, msg], i) => (
              <div key={i} className="pwt-line"><span className="pwt-tag">[{tag}]</span> {msg}</div>
            ))}
            {partial !== null && <div className="pwt-line" aria-hidden="true">{partial}<span className="pwt-cursor" /></div>}
            {!done && partial === null && <div className="pwt-line pwt-dim">... awaiting backend response<span className="pwt-cursor" /></div>}
            {run.status === "success" && (
              <div className="pwt-line" data-testid="text-terminal-ok"><span className="pwt-tag-ok">[OK ]</span> root cause identified in {fmtSec(run.elapsed ?? NaN)} · {run.filePath}</div>
            )}
            {run.status === "error" && (
              <div className="pwt-line" role="alert" data-testid="text-terminal-err"><span className="pwt-tag-err">[ERR]</span> {run.error}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
