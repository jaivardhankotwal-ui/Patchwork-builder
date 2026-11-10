import { useId } from "react";
import "./dragon-mark.css";

type Props = { size?: number; className?: string; title?: string };

type Pt = [number, number];
const tri = (...p: Pt[]) => `M${p.map((q) => q.join(" ")).join(" L")} Z`;

// Key vertices (viewBox 0 0 120 120, right-facing profile). Hinge = M.
const K: Pt = [36, 40], A: Pt = [44, 30], B: Pt = [58, 27], C: Pt = [73, 33], D: Pt = [96, 40], E: Pt = [115, 46];
const F: Pt = [101, 54], M: Pt = [66, 58], G: Pt = [50, 56], I: Pt = [61, 44], J: Pt = [85, 46];
const HORNS = [tri([3, 5], A, [30, 30]), tri([30, 30], A, K), tri([22, 0], B, A), tri([22, 0], A, [36, 22])];
const HEAD = [tri(K, A, I), tri(A, B, I), tri(B, C, I), tri(I, C, J), tri(C, D, J), tri(D, E, F), tri(D, F, J), tri(J, F, M), tri(I, J, M), tri(I, M, G), tri(K, I, G)];
const UPPER_TEETH = [tri([97, 54], [93, 61], [89, 55]), tri([85, 56], [81, 63], [77, 57])];
// Jaw (articulated around M)
const P: Pt = [80, 62], JT: Pt = [108, 60], L: Pt = [84, 71], N: Pt = [60, 72];
const JAW = [tri(M, P, N), tri(M, JT, P), tri(P, JT, L), tri(P, L, N)];
const LOWER_TEETH = [tri([101, 60], [98, 53], [95, 60]), tri([90, 61], [87, 54], [84, 62])];
// Neck
const S1: Pt = [26, 62], S2: Pt = [46, 76], Q: Pt = [57, 72], S3: Pt = [18, 90], S4: Pt = [38, 98], S5: Pt = [53, 92];
const NECK = [tri(K, G, S1), tri(G, Q, S2), tri(G, S2, S1), tri(S1, S2, S3), tri(S2, S4, S3), tri(S2, Q, S5), tri(S2, S5, S4),
  tri(S3, S4, [12, 118]), tri(S4, [34, 118], [12, 118]), tri(S4, S5, [34, 118]), tri(S5, [55, 118], [34, 118])];
const SPIKES = [tri(K, [14, 44], [30, 52]), tri(S1, [6, 68], [22, 76]), tri(S3, [1, 98], [15, 104]), tri([31, 52], [16, 56], S1)];
const SHADES = ["#060b0a", "#0a1412", "#0d1a17", "#071210"];

/** Low-poly cyber dragon head + neck. Gradient/filter IDs are per-instance via useId. */
export function DragonMark({ size = 28, className = "", title }: Props) {
  const raw = useId().replace(/:/g, "");
  const grad = `dg-${raw}`;
  const glow = `dglow-${raw}`;
  const edge = `url(#${grad})`;
  const facet = (d: string, i: number, k: string) => (
    <path key={k + i} className="dm-draw" pathLength={1} d={d} fill={SHADES[i % SHADES.length]} stroke={edge} strokeWidth="0.9" />
  );
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}
      className={`dragon-mark ${className}`} role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00ffcc" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
        <filter id={glow} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor="#00ffcc" floodOpacity=".6" />
        </filter>
      </defs>
      <g filter={`url(#${glow})`} strokeLinejoin="round">
        <g className="dm-neck">{SPIKES.map((d, i) => facet(d, i + 1, "s"))}{NECK.map((d, i) => facet(d, i, "n"))}</g>
        <g className="dm-jaw">
          {JAW.map((d, i) => facet(d, i + 2, "j"))}
          {LOWER_TEETH.map((d, i) => <path key={"lt" + i} d={d} fill="#bffff0" stroke="#00ffcc" strokeWidth=".5" />)}
        </g>
        <g className="dm-head">
          {HORNS.map((d, i) => facet(d, i, "h"))}
          {HEAD.map((d, i) => facet(d, i, "u"))}
          {UPPER_TEETH.map((d, i) => <path key={"ut" + i} d={d} fill="#bffff0" stroke="#00ffcc" strokeWidth=".5" />)}
          <path className="dm-circuit" d="M40 44 L52 48 L61 44 M85 46 L92 50" fill="none" stroke="#00ffcc" strokeWidth=".8" opacity=".7" />
          <circle className="dm-node" cx="108" cy="47" r="1.2" fill="#00ffcc" />
          <path className="dm-eye" d="M59 38 L76 36 L66 41 Z" fill="#eafff9" stroke="#00ffcc" strokeWidth=".7" />
        </g>
      </g>
    </svg>
  );
}
