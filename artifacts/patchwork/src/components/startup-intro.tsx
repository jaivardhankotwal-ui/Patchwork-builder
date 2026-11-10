import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DragonMark } from "@/components/dragon-mark";
import { useReducedMotion } from "@/lib/reduced-motion";
import "./startup-intro.css";

const SESSION_KEY = "patchwork.intro.document";
const DURATION = 3000;

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

const SNIPPETS = ["0101", "git diff", "def fix():", ">>> PATCH", "{status: 200}", "ZeroDivisionError -> RESOLVED"];
// Deterministic particle field: bounded count, fixed values (no Math.random).
const PARTICLES = Array.from({ length: 18 }, (_, i) => {
  const t = i / 17;
  const spread = Math.sin(i * 2.399) * 70;
  return {
    text: SNIPPETS[i % SNIPPETS.length],
    x: Math.round(60 + t * 340 + (i % 3) * 18),
    y: Math.round(spread * (0.4 + t)),
    r: Math.round(Math.sin(i * 1.7) * 14),
    cx: Math.round(150 - t * 40),
    d: 820 + (i % 9) * 110,
  };
});

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
    const t = window.setTimeout(finish, DURATION);
    return () => window.clearTimeout(t);
  }, [playing, run, finish]);

  useEffect(() => {
    if (!playing) return;
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
          <div className="intro-stage" aria-hidden="true">
            <div className="intro-dragon"><DragonMark size={240} /></div>
            {!reduced && (
              <div className="intro-flame">
                <span className="intro-flame-ribbon" />
                <span className="intro-flame-ribbon intro-flame-ribbon-secondary" />
                {PARTICLES.map((p, i) => (
                  <span key={i} className="intro-p" style={{
                    "--x": `${p.x}px`, "--y": `${p.y}px`, "--r": `${p.r}deg`, "--cx": `${p.cx}px`, "--d": `${p.d}ms`,
                  } as CSSProperties}>{p.text}</span>
                ))}
              </div>
            )}
            <div className="intro-brand">
              <div className="intro-word">PATCHWORK</div>
              <div className="intro-caption">incident → evidence → patch</div>
            </div>
          </div>
          <button ref={skipRef} type="button" className="intro-skip" onClick={finish} data-testid="button-skip-intro">
            Skip <span aria-hidden="true">· Esc</span>
          </button>
        </div>
      )}
    </IntroContext.Provider>
  );
}
