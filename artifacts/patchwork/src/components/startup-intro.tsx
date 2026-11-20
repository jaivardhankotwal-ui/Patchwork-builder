import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DragonFlightScene } from "@/components/dragon-flight-scene";
import { useReducedMotion } from "@/lib/reduced-motion";
import "./startup-intro.css";

const SESSION_KEY = "patchwork.intro.document";
const DURATION = 8000;
const REDUCED_DURATION = 2500;

// A refresh creates a new document/timeOrigin. Route changes, visibility changes
// and React remounts do not. Keep the session flag tied to this document so a
// refresh can replay the intro without replaying it during in-app navigation.
function claimDocumentIntro() {
  const documentId = String(performance.timeOrigin);
  try {
    if (sessionStorage.getItem(SESSION_KEY) === documentId) return false;
    sessionStorage.setItem(SESSION_KEY, documentId);
  } catch {
    // Storage unavailable: module-level decision still prevents navigation replays.
  }
  return true;
}

const playOnStartup = claimDocumentIntro();
let introFinished = !playOnStartup;

type Ctx = { replay: (trigger?: HTMLElement | null) => void; playing: boolean };
const IntroContext = createContext<Ctx>({ replay: () => {}, playing: false });
export const useIntro = () => useContext(IntroContext);

export function StartupIntro({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [run, setRun] = useState(() => (introFinished ? 0 : 1));
  const [playing, setPlaying] = useState(() => !introFinished);
  const returnFocus = useRef<HTMLElement | null>(null);
  const skipRef = useRef<HTMLButtonElement>(null);

  const finish = useCallback(() => {
    introFinished = true;
    setPlaying(false);
  }, []);

  const replay = useCallback((trigger?: HTMLElement | null) => {
    returnFocus.current = trigger ?? (document.activeElement as HTMLElement | null);
    setRun((r) => r + 1);
    setPlaying(true);
  }, []);

  // Cancellable timer per run; replay increments run → old timer cleared.
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(finish, reduced ? REDUCED_DURATION : DURATION);
    return () => window.clearTimeout(t);
  }, [playing, run, finish, reduced]);

  useEffect(() => {
    if (!playing) return;
    if (!returnFocus.current && document.activeElement instanceof HTMLElement) {
      returnFocus.current = document.activeElement;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    skipRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [playing, run, finish]);

  // Restore focus after the overlay closes (dashboard no longer inert).
  useEffect(() => {
    if (playing || !returnFocus.current) return;
    const el = returnFocus.current;
    returnFocus.current = null;
    requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }, [playing]);

  return (
    <IntroContext.Provider value={{ replay, playing }}>
      <div className={`startup-dashboard ${playing ? "startup-dashboard-hidden" : ""}`}
        inert={playing} aria-hidden={playing || undefined}>
        {children}
      </div>
      {playing && (
        <div key={run} className={`intro-root ${reduced ? "intro-reduced" : ""}`} data-testid="startup-intro"
          role="dialog" aria-modal="true" aria-label="Starting Patchwork">
          <div className="intro-scene" aria-hidden="true">
            <DragonFlightScene reduced={reduced} />
            <div className="intro-brand">
              <span className="intro-caption">incident <i>→</i> evidence <i>→</i> patch</span>
              <div className="intro-badges">
                <span className="intro-badge">AI ASSISTED</span>
                <span className="intro-badge">MANUAL BY DEFAULT</span>
                <span className="intro-badge">OPT-IN AUTONOMY</span>
              </div>
            </div>
            <div className="intro-index"><span>PATCHWORK / SYSTEM READY</span><span>01 — 03</span></div>
          </div>
          <button ref={skipRef} type="button" className="intro-skip" onClick={finish} data-testid="button-skip-intro">
            Skip <span aria-hidden="true">· Esc</span>
          </button>
        </div>
      )}
    </IntroContext.Provider>
  );
}
