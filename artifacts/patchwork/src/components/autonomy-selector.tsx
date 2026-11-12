import type { AutonomyMode } from "@/lib/pr-status";

export function AutonomySelector({ value, onChange }: { value: AutonomyMode; onChange: (mode: AutonomyMode) => void }) {
  const auto = value === "auto_merge";
  return (
    <fieldset className={`rounded-lg border p-3 transition-all ${auto ? "border-amber-400/40 bg-amber-400/5 shadow-[0_0_18px_#fbbf2410]" : "border-cyan-500/20 bg-cyan-500/[0.03]"}`}>
      <legend className="px-1 font-mono text-[10px] uppercase tracking-widest text-zinc-400">Autonomy Level</legend>
      <div className="grid gap-1.5">
        {([
          ["manual", "🛡️ Manual Review (Draft PR)", "Safe mode · default"],
          ["auto_merge", "⚡ Autonomous Auto-Merge", "Level 5 · writes to main"],
        ] as const).map(([mode, label, hint]) => (
          <label key={mode} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors ${value === mode ? mode === "auto_merge" ? "border-amber-400/50 text-amber-200 bg-amber-400/10" : "border-cyan-400/40 text-cyan-200 bg-cyan-400/10" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}>
            <input type="radio" name="autonomy-level" value={mode} checked={value === mode} onChange={() => onChange(mode)} data-testid={`autonomy-${mode}`}
              className={mode === "auto_merge" ? "accent-amber-400" : "accent-cyan-400"} />
            <span className="flex-1">{label}</span>
            <span className="font-mono text-[9px]">{hint}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400" data-testid="text-autonomy-warning">
        {auto ? "Explicit confirmation required. Validation is simulated only — tests are not run. GitHub rules can block merging." : "Creates a draft PR for human review. Never merges automatically."}
      </p>
    </fieldset>
  );
}
