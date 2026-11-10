import { useMemo, useState } from "react";
import { Columns2, Rows3 } from "lucide-react";
import { lineDiff, toSideBySide, type DiffLine } from "@/lib/diff";

const tone = (k?: DiffLine["kind"]) =>
  k === "add" ? "bg-emerald-500/10 text-emerald-200" : k === "del" ? "bg-rose-500/10 text-rose-200" : "text-zinc-400";
const sign = (k?: DiffLine["kind"]) => (k === "add" ? "+" : k === "del" ? "-" : " ");
const signTone = (k?: DiffLine["kind"]) => (k === "add" ? "text-emerald-400" : k === "del" ? "text-rose-400" : "text-zinc-600");

export function DiffViewer({ original, patched, filePath }: { original: string; patched: string; filePath: string }) {
  const [mode, setMode] = useState<"split" | "unified">("split");
  const lines = useMemo(() => lineDiff(original || "", patched || ""), [original, patched]);
  const rows = useMemo(() => toSideBySide(lines), [lines]);
  const adds = lines.filter((l) => l.kind === "add").length;
  const dels = lines.filter((l) => l.kind === "del").length;

  return (
    <div className="pw-scan-once relative rounded-lg border border-cyan-400/15 bg-[hsl(190_45%_3%/0.8)] overflow-hidden" data-testid="diff-viewer">
      <div className="flex items-center justify-between gap-3 px-3 h-10 border-b border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center gap-3 min-w-0 font-mono text-xs">
          <span className="truncate text-zinc-300" data-testid="text-diff-path">{filePath}</span>
          <span className="text-emerald-400">+{adds}</span>
          <span className="text-rose-400">-{dels}</span>
        </div>
        <div className="flex rounded-md border border-zinc-800 p-0.5 bg-zinc-950">
          {(["split", "unified"] as const).map((m) => (
            <button key={m} data-testid={`button-diff-${m}`} onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-colors ${mode === m ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>
              {m === "split" ? <Columns2 className="size-3" /> : <Rows3 className="size-3" />}
              {m === "split" ? "Split" : "Unified"}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-auto scroll-thin max-h-[440px] font-mono text-[12px] leading-[1.65]">
        {mode === "unified" ? (
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className={tone(l.kind)}>
                  <td className="w-10 select-none text-right pr-2 text-zinc-600 align-top">{l.a ?? ""}</td>
                  <td className="w-10 select-none text-right pr-2 text-zinc-600 align-top">{l.b ?? ""}</td>
                  <td className={`w-5 select-none text-center align-top ${signTone(l.kind)}`}>{sign(l.kind)}</td>
                  <td className="pr-4 whitespace-pre">{l.text || " "}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse table-fixed min-w-[640px]">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className={`w-10 select-none text-right pr-2 text-zinc-600 align-top ${r.left ? tone(r.left.kind) : "bg-zinc-900/40"}`}>{r.left?.a ?? ""}</td>
                  <td className={`whitespace-pre overflow-hidden pr-3 border-r border-zinc-800 align-top ${r.left ? tone(r.left.kind) : "bg-zinc-900/40"}`}>
                    <span className={signTone(r.left?.kind)}>{r.left ? sign(r.left.kind) : " "} </span>{r.left?.text ?? ""}
                  </td>
                  <td className={`w-10 select-none text-right pr-2 text-zinc-600 align-top ${r.right ? tone(r.right.kind) : "bg-zinc-900/40"}`}>{r.right?.b ?? ""}</td>
                  <td className={`whitespace-pre overflow-hidden pr-3 align-top ${r.right ? tone(r.right.kind) : "bg-zinc-900/40"}`}>
                    <span className={signTone(r.right?.kind)}>{r.right ? sign(r.right.kind) : " "} </span>{r.right?.text ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
