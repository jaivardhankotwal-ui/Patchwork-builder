import { useState } from "react";
import { Typewriter } from "./typewriter";

/** Read-only stack trace in a <details>; types out the first time it is opened. */
export function TraceReveal({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="w-full text-zinc-400" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer hover:text-cyan-200 focus-visible:outline-none focus-visible:text-cyan-200">{label}</summary>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[hsl(190_45%_3%)] border border-cyan-400/10 p-3 text-[11px] font-mono text-emerald-200/80 scroll-thin">
        <Typewriter text={text} active={open} maxMs={1100} />
      </pre>
    </details>
  );
}
