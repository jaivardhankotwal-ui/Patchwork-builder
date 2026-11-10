import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/reduced-motion";

/**
 * Visual-only typewriter for read-only text. Full text is always present for
 * screen readers (sr-only) and becomes the real visible/copyable text once done.
 * Progress survives deactivation (e.g. collapsed panel) and resumes; it never
 * replays for the same mounted instance.
 */
export function Typewriter({ text, active = true, cps = 900, maxMs = 1400, cursor = true, onDone, className }: {
  text: string; active?: boolean; cps?: number; maxMs?: number; cursor?: boolean; onDone?: () => void; className?: string;
}) {
  const reduced = useReducedMotion();
  const [n, setN] = useState<number | null>(text.length === 0 ? null : 0);
  const progress = useRef(0);
  const textRef = useRef(text);
  textRef.current = text;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const fired = useRef(false);

  const finish = () => {
    setN(null);
    if (!fired.current) { fired.current = true; doneRef.current?.(); }
  };

  useEffect(() => {
    if (n === null) { if (!fired.current) finish(); return; }
    if (reduced) { finish(); return; }
    if (!active) return;
    const len = textRef.current.length;
    const dur = Math.max(1, Math.min(maxMs, (len / cps) * 1000));
    const startAt = performance.now() - (progress.current / Math.max(1, len)) * dur;
    let raf = 0;
    const tick = (t: number) => {
      const total = textRef.current.length;
      const next = Math.min(total, Math.ceil(((t - startAt) / dur) * total));
      progress.current = next;
      if (next >= total) { finish(); return; }
      setN(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduced, n === null]);

  if (n === null) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{text.slice(0, n)}{cursor && <span className="pw-cursor" />}</span>
    </span>
  );
}
