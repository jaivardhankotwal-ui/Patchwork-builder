import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FullBodyDragon } from "./_shared/full-body-dragon";
import { useReducedMotion } from "./_shared/reduced-motion";
import "./_group.css";
import "./Current.css";

const DURATION = 3800;
const SNIPPETS = ["0101", "git diff", "def fix():", ">>> PATCH", "{status: 200}", "ZeroDivisionError -> RESOLVED"];
const PARTICLES = Array.from({ length: 18 }, (_, i) => {
  const t = i / 17, spread = Math.sin(i * 2.399) * 46;
  return { text: SNIPPETS[i % SNIPPETS.length], x: Math.round(60 + t * 340 + (i % 3) * 18), y: Math.round(spread * (0.4 + t)),
    r: Math.round(Math.sin(i * 1.7) * 14), cx: Math.round(200 + t * 60), d: 1250 + (i % 9) * 110 };
});
type ContextValue = { replay: () => void; playing: boolean };
const IntroContext = createContext<ContextValue>({ replay: () => {}, playing: false });
const useIntro = () => useContext(IntroContext);

function PreviewControls() {
  const { replay, playing } = useIntro();
  return (
    <div className="current-controls">
      <span>EXTRACTED CURRENT · CSS/SVG SEQUENCE</span>
      <button type="button" onClick={replay} disabled={playing}>Replay current intro</button>
    </div>
  );
}

export function Current() {
  const reduced = useReducedMotion();
  const [run, setRun] = useState(1);
  const [playing, setPlaying] = useState(true);
  const skipRef = useRef<HTMLButtonElement>(null);
  const finish = useCallback(() => setPlaying(false), []);
  const replay = useCallback(() => { setRun(value => value + 1); setPlaying(true); }, []);

  useEffect(() => {
    if (!playing) return;
    const timeout = window.setTimeout(finish, DURATION);
    return () => window.clearTimeout(timeout);
  }, [playing, run, finish]);

  useEffect(() => {
    if (!playing) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, finish]);

  return (
    <IntroContext.Provider value={{ replay, playing }}>
      <main className="current-preview">
        {!playing && <PreviewControls />}
        <div className={`current-dashboard ${playing ? "current-dashboard-hidden" : ""}`} aria-hidden={playing}>
          <div className="current-dashboard-copy"><span>Patchwork dashboard preview</span><small>The real dashboard stays outside this extracted intro component.</small></div>
        </div>
        {playing && (
          <div key={run} className={`intro-root ${reduced ? "intro-reduced" : ""}`} role="dialog" aria-modal="true" aria-label="Starting Patchwork">
            <div className="intro-shake" aria-hidden="true"><div className="intro-stage">
              <div className="intro-dragon"><div className="intro-dragon-fly"><FullBodyDragon />
                {!reduced && <div className="intro-flame">
                  <span className="intro-flame-ribbon" /><span className="intro-flame-ribbon intro-flame-ribbon-secondary" />
                  {PARTICLES.map((p, i) => <span key={i} className="intro-p" style={{
                    "--x": `${p.x}px`, "--y": `${p.y}px`, "--r": `${p.r}deg`, "--cx": `${p.cx}px`, "--d": `${p.d}ms`,
                  } as CSSProperties}>{p.text}</span>)}
                </div>}
              </div></div>
              <div className="intro-brand">
                <div className="intro-word">PATCHWORK</div><div className="intro-caption">incident → evidence → patch</div>
                <div className="intro-badges"><span className="intro-badge">AI ASSISTED</span><span className="intro-badge">MANUAL BY DEFAULT</span><span className="intro-badge">OPT-IN AUTONOMY</span></div>
              </div>
            </div></div>
            <button ref={skipRef} type="button" className="intro-skip" onClick={finish}>Skip · Esc</button>
          </div>
        )}
      </main>
    </IntroContext.Provider>
  );
}
