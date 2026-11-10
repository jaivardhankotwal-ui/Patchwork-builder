/** Laser-scan loader over the actual submitted trace (no fabricated content). */
export function LaserScan({ trace, elapsed }: { trace: string; elapsed: number }) {
  const lines = trace.split("\n").filter((l) => l.trim()).slice(-14);
  const stages = ["Parsing stack frames", "Fetching file and last 5 commits from GitHub", "Asking Gemini for root cause and patch"];
  return (
    <div className="pw-glass pw-active-card rounded-xl p-5 space-y-4" role="status" aria-label="Diagnosis in progress" data-testid="loader-diagnosis">
      <ol className="space-y-2">
        {stages.map((s, i) => {
          const on = elapsed > i * 3;
          return (
            <li key={s} className={`flex items-center gap-3 text-sm font-mono ${on ? "text-cyan-200" : "text-zinc-500"}`}>
              <span className={`size-1.5 rounded-full ${on ? "bg-cyan-300 pw-dot-live" : "bg-zinc-700"}`} />
              <span className="text-[10px] text-zinc-500">{String(i + 1).padStart(2, "0")}</span>{s}
            </li>
          );
        })}
      </ol>
      <div className="pw-laser relative overflow-hidden rounded-lg border border-cyan-400/20 bg-[hsl(190_45%_3%/0.85)]" aria-hidden="true">
        <div className="flex items-center justify-between px-3 h-7 border-b border-cyan-400/15 text-[10px] font-mono uppercase tracking-[0.16em] text-cyan-300/70">
          <span>scanning submitted trace</span><span className="tabular-nums">{elapsed.toFixed(1)}s</span>
        </div>
        <pre className="p-3 h-48 overflow-hidden font-mono text-[11px] leading-relaxed text-emerald-200/45 whitespace-pre-wrap break-all">{lines.join("\n")}</pre>
        <span className="pw-laser-beam" />
      </div>
    </div>
  );
}
