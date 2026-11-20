import { useEffect, useRef } from "react";
import { BONES, CIRCUIT, EYE, FACETS, GLYPHS, HEAD_OFFSET, toD, type Group } from "./dragon-geometry";
import "./dragon-intro-2d.css";

type Props = { reduced: boolean; onReady: () => void; onError: (reason: string) => void };

const W = 1600, H = 900;
const WORD = "PATCHWORK";
const ADV = 150, GX = (W - (9 * 100 + 8 * 50)) / 2, GY = 380;
const BREAK = 6, STAGGER = 0.45, FLIGHT = 1.5;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));

function rot(m: DOMMatrix, deg: number, cx: number, cy: number) {
  return m.translate(cx, cy).rotate(deg).translate(-cx, -cy);
}

/** Pose of the whole dragon (local 420x280 space -> stage) at time t. */
function dragonMatrix(t: number) {
  const u = ease(clamp(t / 5));
  const s = 2.15 * Math.pow(900, u - 1);
  const lunge = bump(t, 4.2, 6.1);
  const hover = Math.sin(t * 1.6) * 6 * u;
  const sc = s * (1 + 0.14 * lunge);
  return new DOMMatrix().translate(W / 2 + 70 * lunge, 430 + hover - 25 * lunge).scale(sc).translate(-215, -140);
}

function groupMatrix(g: Group, t: number) {
  const roar = bump(t, 4.2, 6.1);
  const freq = 4.2 + 3.5 * roar;
  const beat = Math.sin(t * freq) * (16 + 14 * roar);
  let m = new DOMMatrix();
  switch (g) {
    case "wingNear": return rot(m, -beat, 240, 122);
    case "wingFar": return rot(m.translate(34, 4), -beat * 0.8 + 4, 240, 122);
    case "tail": return rot(m, Math.sin(t * 2.3) * 7 + roar * 6, 165, 165);
    case "body": return m;
    default: {
      m = rot(m.translate(HEAD_OFFSET[0], HEAD_OFFSET[1]), -roar * 9, 30, 110);
      if (g === "jaw") m = rot(m, roar * 24 + Math.max(0, Math.sin(t * 3)) * 3, 66, 58);
      return m;
    }
  }
}

const lerpM = (a: DOMMatrix, b: DOMMatrix, e: number) =>
  `matrix(${a.a + (b.a - a.a) * e} ${a.b + (b.b - a.b) * e} ${a.c + (b.c - a.c) * e} ${a.d + (b.d - a.d) * e} ${a.e + (b.e - a.e) * e} ${a.f + (b.f - a.f) * e})`;

export function DragonIntro2D({ reduced, onReady, onError }: Props) {
  const shardRefs = useRef<(SVGPathElement | null)[]>([]);
  const letterRefs = useRef<(SVGPathElement | null)[]>([]);
  const glowRefs = useRef<(SVGPathElement | null)[]>([]);
  const extrasRef = useRef<SVGGElement>(null);
  const headExtrasRef = useRef<SVGGElement>(null);
  const pinRef = useRef<SVGCircleElement>(null);
  const readyRef = useRef(onReady); readyRef.current = onReady;
  const errRef = useRef(onError); errRef.current = onError;

  useEffect(() => {
    let raf = 0;
    try {
      const letters = letterRefs.current;
      if (reduced) {
        letters.forEach((l, i) => { l?.style.setProperty("stroke-dashoffset", "0"); glowRefs.current[i]?.style.setProperty("opacity", "1"); });
        shardRefs.current.forEach((p) => p?.style.setProperty("opacity", "0"));
        extrasRef.current?.style.setProperty("opacity", "0");
        headExtrasRef.current?.style.setProperty("opacity", "0");
        pinRef.current?.style.setProperty("opacity", "0");
        readyRef.current();
        return;
      }
      // Assign shards (tail -> head, left -> right) to letters in order; targets sampled on letter paths.
      const cent = FACETS.map((f) => {
        const c = f.pts.reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[1] / 3], [0, 0]);
        const off = ["neck", "jaw", "head"].includes(f.group) ? HEAD_OFFSET : [0, 0];
        return [c[0] + off[0], c[1] + off[1]] as [number, number];
      });
      const order = FACETS.map((_, i) => i).sort((a, b) => cent[a][0] - cent[b][0]);
      const plan = new Array(FACETS.length);
      order.forEach((idx, rank) => {
        const k = Math.min(8, Math.floor((rank / FACETS.length) * 9));
        const lp = letters[k];
        const len = lp ? lp.getTotalLength() : 0;
        const pt = lp ? lp.getPointAtLength(((rank * 0.618) % 1) * len) : { x: 50, y: 70 };
        const f = FACETS[idx];
        const lc = f.pts.reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[1] / 3], [0, 0]);
        const onset = BREAK + k * STAGGER + ((rank * 37) % 11) / 11 * 0.35;
        const end = new DOMMatrix().translate(GX + k * ADV + pt.x, GY + pt.y).rotate(((rank * 53) % 90) - 45).scale(0.55).translate(-lc[0], -lc[1]);
        const ang = ((rank * 97) % 360) * Math.PI / 180;
        plan[idx] = { k, onset, end, start: null as DOMMatrix | null, burst: [Math.cos(ang) * 90, Math.sin(ang) * 90 - 40] };
      });

      let t0 = 0, first = true;
      const frame = (now: number) => {
        if (first) { t0 = now; first = false; readyRef.current(); }
        const t = (now - t0) / 1000;
        const dm = dragonMatrix(Math.min(t, BREAK + 0.6));
        const pin = pinRef.current;
        if (pin) pin.style.opacity = String(1 - clamp((t - 0.6) / 0.8));
        FACETS.forEach((f, i) => {
          const el = shardRefs.current[i]; if (!el) return;
          const p = plan[i];
          const live = dm.multiply(groupMatrix(f.group, t));
          if (t < p.onset) { el.setAttribute("transform", live.toString()); return; }
          if (!p.start) { p.start = live; el.classList.add("i2d-shard-hot"); }
          const e = ease(clamp((t - p.onset) / FLIGHT));
          const b = Math.sin(e * Math.PI);
          const m = lerpM(p.start, p.end, e);
          el.setAttribute("transform", `translate(${p.burst[0] * b} ${p.burst[1] * b}) ${m}`);
          el.style.opacity = String((f.group === "wingFar" ? 0.5 + 0.5 * e : 1) * (1 - clamp((e - 0.8) / 0.2)));
        });
        const fade = String(1 - clamp((t - BREAK) / 0.6));
        if (extrasRef.current) { extrasRef.current.setAttribute("transform", dm.multiply(groupMatrix("wingNear", t)).toString()); extrasRef.current.style.opacity = fade; }
        if (headExtrasRef.current) { headExtrasRef.current.setAttribute("transform", dm.multiply(groupMatrix("head", t)).toString()); headExtrasRef.current.style.opacity = fade; }
        letters.forEach((l, k) => {
          const on = BREAK + k * STAGGER + FLIGHT * 0.6;
          const d = clamp((t - on) / 0.7);
          l?.style.setProperty("stroke-dashoffset", String(1 - ease(d)));
          glowRefs.current[k]?.style.setProperty("opacity", String(d));
        });
        if (t < 13) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    } catch (e) {
      errRef.current(e instanceof Error ? e.message : "intro failed");
    }
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div className="intro2d-host" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="intro2d-svg">
        <defs>
          <linearGradient id="i2d-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#00ffcc" /><stop offset="1" stopColor="#10b981" />
          </linearGradient>
          <filter id="i2d-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#00ffcc" floodOpacity=".5" />
          </filter>
          <filter id="i2d-neon" x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        <circle ref={pinRef} cx={W / 2} cy={430} r={3} fill="#7dffe3" className="i2d-pin" />
        <g className="i2d-word">
          {WORD.split("").map((ch, k) => (
            <g key={k} transform={`translate(${GX + k * ADV} ${GY})`}>
              <path ref={(el) => { glowRefs.current[k] = el; }} d={GLYPHS[ch]} className="i2d-letter-glow" filter="url(#i2d-neon)" />
              <path ref={(el) => { letterRefs.current[k] = el; }} d={GLYPHS[ch]} pathLength={1} className="i2d-letter" />
            </g>
          ))}
        </g>
        <g filter="url(#i2d-glow)" strokeLinejoin="round">
          {FACETS.map((f, i) => (
            <path key={i} ref={(el) => { shardRefs.current[i] = el; }} d={toD(f.pts)} fill={f.fill}
              stroke={f.light ? "#00ffcc" : "url(#i2d-edge)"} strokeWidth={f.light ? 0.6 : 1.1}
              opacity={f.group === "wingFar" ? 0.5 : 1} className="i2d-shard" />
          ))}
          <g ref={extrasRef}><path d={BONES} fill="none" stroke="#00ffcc" strokeWidth="1.3" opacity=".8" /></g>
          <g ref={headExtrasRef}>
            <path d={CIRCUIT} fill="none" stroke="#00ffcc" strokeWidth=".8" opacity=".7" />
            <circle cx="108" cy="47" r="1.2" fill="#00ffcc" />
            <path d={toD(EYE)} fill="#eafff9" stroke="#00ffcc" strokeWidth=".7" className="i2d-eye" />
          </g>
        </g>
      </svg>
    </div>
  );
}
