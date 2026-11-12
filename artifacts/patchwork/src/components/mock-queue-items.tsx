import { ArrowDownToLine } from "lucide-react";
import { TraceReveal } from "./motion/trace-reveal";
import { mockCrashes } from "@/lib/mock-crashes";

export function MockQueueItems({ onLoadTrace }: { onLoadTrace: (trace: string) => void }) {
  return (
    <div className="space-y-3" data-testid="mock-incidents">
      <p className="text-[11px] text-amber-200/80">3 mock crashes · preview only · not submitted to Gemini or counted as real incidents</p>
      {mockCrashes.map((crash, index) => (
        <article key={crash.id} data-testid={`mock-incident-${crash.id}`} className="pw-row-in border-t border-cyan-400/10 pt-3 space-y-2" style={{ animationDelay: `${index * 60}ms` }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-medium text-rose-200">{crash.title}</h4>
            <span className="rounded border border-amber-400/25 bg-amber-400/5 px-2 py-0.5 text-[10px] font-mono text-amber-200">MOCK · {crash.id}</span>
          </div>
          <p className="text-[11px] font-mono text-zinc-400 break-all">{crash.service} · {crash.location}</p>
          <p className="text-[11px] text-zinc-500">Synthetic production-style trace · awaiting review</p>
          <button
            type="button"
            onClick={() => onLoadTrace(crash.trace)}
            data-testid={`button-load-${crash.id}`}
            className="inline-flex items-center gap-1.5 rounded border border-cyan-500/25 px-2.5 py-1.5 text-[11px] text-cyan-200 transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/10"
          >
            <ArrowDownToLine className="size-3.5" />
            Load into Analyzer
          </button>
          <div className="text-xs"><TraceReveal label="View mock stack trace" text={crash.trace} /></div>
        </article>
      ))}
    </div>
  );
}
