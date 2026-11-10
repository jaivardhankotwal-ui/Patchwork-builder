import { Sparkles } from "lucide-react";
import "./_group.css";

// Extracted from the dashboard's actual idle Analyze control before redesign.
export function Current() {
  return (
    <div className="pw-baseline min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <button data-testid="button-analyze"
          className="pw-cta relative w-full h-11 rounded-lg bg-orange-500 text-zinc-950 font-medium text-sm flex items-center justify-center gap-2 overflow-hidden hover:bg-orange-400 active:scale-[0.99] disabled:bg-zinc-800 disabled:text-zinc-500 transition-[background-color,transform]">
          <Sparkles className="size-4" />Analyze &amp; diagnose incident
        </button>
      </div>
    </div>
  );
}
