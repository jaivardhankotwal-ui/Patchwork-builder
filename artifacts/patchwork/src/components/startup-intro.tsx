import { useEffect, useState, type ReactNode } from "react";

const SESSION_KEY = "patchwork.intro.document";

// A refresh creates a new document/timeOrigin. Route changes, visibility changes
// and React remounts do not. Keep the session flag tied to this document so a
// refresh can replay the intro without replaying it during in-app navigation.
function claimDocumentIntro() {
  const documentId = String(performance.timeOrigin);
  try {
    if (sessionStorage.getItem(SESSION_KEY) === documentId) return false;
    sessionStorage.setItem(SESSION_KEY, documentId);
  } catch {
    // Storage can be unavailable in private/restricted browsers. The module-level
    // decision still prevents navigation or re-renders from restarting the intro.
  }
  return true;
}

const playOnStartup = claimDocumentIntro();
let introFinished = !playOnStartup;

export function StartupIntro({ children }: { children: ReactNode }) {
  const [shouldPlay] = useState(() => !introFinished);
  const [phase, setPhase] = useState<"logo" | "brand" | "exit" | "done">(shouldPlay ? "logo" : "done");

  useEffect(() => {
    if (!shouldPlay) return;
    const timers = [
      window.setTimeout(() => setPhase("brand"), 1200),
      window.setTimeout(() => setPhase("exit"), 1950),
      window.setTimeout(() => { introFinished = true; setPhase("done"); }, 2500),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [shouldPlay]);

  const playing = phase !== "done";

  useEffect(() => {
    if (!playing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [playing]);

  return (
    <>
      <div
        className={`startup-dashboard ${phase === "exit" || phase === "done" ? "startup-dashboard-visible" : ""}`}
        inert={playing}
        aria-hidden={playing || undefined}
      >
        {children}
      </div>
      {playing && (
        <div className={`startup-intro startup-intro-phase-${phase}`} data-testid="startup-intro"
          role="status" aria-label="Starting Patchwork">
          <div className="startup-intro-halo" aria-hidden="true" />
          <div className="startup-intro-identity" aria-hidden="true">
            <div className="startup-intro-mark">pw</div>
            <div className="startup-intro-brand">Patchwork<span className="startup-intro-period">.</span></div>
          </div>
          <span className="startup-intro-caption" aria-hidden="true">INCIDENT → EVIDENCE → PATCH</span>
        </div>
      )}
    </>
  );
}
