import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FullBodyDragon } from "@/components/full-body-dragon";
import { useReducedMotion } from "@/lib/reduced-motion";
import "./startup-intro.css";

const SESSION_KEY = "patchwork.intro.document";
const DURATION = 3800;
const REDUCED_DURATION = 1500;
const SNIPPETS = ["0101", "git diff", "def fix():", ">>> PATCH", "{status: 200}", "ZeroDivisionError -> RESOLVED"];
const PARTICLES = Array.from({ length: 18 }, (_, i) => {
  const t = i / 17;
  const spread = Math.sin(i * 2.399) * 46;
  return {
    text: SNIPPETS[i % SNIPPETS.length],
    x: Math.round(60 + t * 340 + (i % 3) * 18),
    y: Math.round(spread * (0.4 + t)),
    r: Math.round(Math.sin(i * 1.7) * 14),
    cx: Math.round(200 + t * 60),
    d: 1250 + (i % 9) * 110,
  };
});

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

function IntroOverlay({ reduced, finish, skipRef }: { reduced: boolean; finish: () => void; skipRef: React.RefObject<HTMLButtonElement | null> }) {
  useEffect(() => {
    const timer = window.setTimeout(finish, reduced ? REDUCED_DURATION : DURATION);
    return () => window.clearTimeout(timer);
  }, [reduced, finish]);

  return (
    <div className={`intro-root ${reduced ? "intro-reduced" : ""}`}
      data-testid="startup-intro" role="dialog" aria-modal="true" aria-label="Starting Patchwork">
      <div className="intro-shake" aria-hidden="true">
        <div className="intro-stage">
          <div className="intro-dragon">
            <div className="intro-dragon-fly">
              <FullBodyDragon />
              {!reduced && (
                <div className="intro-flame">
                  <span className="intro-flame-ribbon" />
                  <span className="intro-flame-ribbon intro-flame-ribbon-secondary" />
                  {PARTICLES.map((particle, index) => (
                    <span key={index} className="intro-p" style={{
                      "--x": `${particle.x}px`, "--y": `${particle.y}px`,
                      "--r": `${particle.r}deg`, "--cx": `${particle.cx}px`,
                      "--d": `${particle.d}ms`,
                    } as CSSProperties}>{particle.text}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="intro-brand">
            <div className="intro-word">PATCHWORK</div>
            <div className="intro-caption">incident → evidence → patch</div>
            <div className="intro-badges">
              <span className="intro-badge">AI ASSISTED</span>
              <span className="intro-badge">MANUAL BY DEFAULT</span>
              <span className="intro-badge">OPT-IN AUTONOMY</span>
            </div>
          </div>
        </div>
      </div>
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
