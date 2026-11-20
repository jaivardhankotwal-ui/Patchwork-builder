import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DragonIntro2D } from "@/components/intro2d/dragon-intro-2d";
import { useReducedMotion } from "@/lib/reduced-motion";
import "./startup-intro.css";

const SESSION_KEY = "patchwork.intro.document";
// Timeline (from scene readiness): 0-5s approach, 5-6s full-size hold,
// 4.2-6.1s roar/lunge, 6-10.35s region-by-region body breakup into shards
// (P,A,T,C,H,W,O,R,K onsets 0.45s apart), letters locked by 10.85s,
// hold, 12.2-12.8s overlay fade.
const DURATION = 12800;
const EXIT_FADE = 600;
const REDUCED_DURATION = 1500;
const FALLBACK_DURATION = 2400;
const READY_TIMEOUT = 6000;

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

type Phase = "loading" | "running" | "failed";

function IntroOverlay({ reduced, finish, skipRef }: { reduced: boolean; finish: () => void; skipRef: React.RefObject<HTMLButtonElement | null> }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [leaving, setLeaving] = useState(false);

  const onReady = useCallback(() => setPhase((p) => (p === "loading" ? "running" : p)), []);
  const onError = useCallback(() => setPhase("failed"), []);

  // Safety net: if the scene never becomes ready, fall back instead of hanging.
  useEffect(() => {
    if (phase !== "loading") return;
    const t = window.setTimeout(() => setPhase("failed"), READY_TIMEOUT);
    return () => window.clearTimeout(t);
  }, [phase]);

  // The playback clock starts only once the scene has rendered its first frame.
  useEffect(() => {
    if (phase === "loading") return;
    const total = phase === "failed" ? FALLBACK_DURATION : reduced ? REDUCED_DURATION : DURATION;
    const fadeAt = Math.max(0, total - EXIT_FADE);
    const a = window.setTimeout(() => setLeaving(true), fadeAt);
    const b = window.setTimeout(finish, total);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [phase, reduced, finish]);

  return (
    <div className={`intro-root intro-${phase} ${reduced ? "intro-reduced" : ""} ${leaving ? "intro-leaving" : ""}`}
      data-testid="startup-intro" role="dialog" aria-modal="true" aria-label="Starting Patchwork"
      style={{ "--intro-exit": `${EXIT_FADE}ms` } as CSSProperties}>
      {phase !== "failed" && <DragonIntro2D reduced={reduced} onReady={onReady} onError={onError} />}
      <div className="intro-vignette" aria-hidden="true" />
      {phase === "loading" && <div className="intro-loading" aria-hidden="true"><span /></div>}
      {phase === "failed" && (
        <div className="intro-fallback" data-testid="intro-fallback">
          <div className="intro-fallback-word">PATCHWORK</div>
          <div className="intro-fallback-note">Animation unavailable · starting dashboard</div>
        </div>
      )}
      {phase === "running" && (
        <div className="intro-caption" aria-hidden="true">incident → evidence → patch</div>
      )}
      <span className="sr-only" aria-live="polite">Patchwork is starting</span>
      <button ref={skipRef} type="button" className="intro-skip" onClick={finish} data-testid="button-skip-intro">
        Skip <span aria-hidden="true">· Esc</span>
      </button>
    </div>
  );
}

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
      {playing && <IntroOverlay key={run} reduced={reduced} finish={finish} skipRef={skipRef} />}
    </IntroContext.Provider>
  );
}
