import { useId } from "react";
import "./dragon-mark.css";

type Props = { size?: number; className?: string; title?: string };

/** Geometric cyberpunk dragon head. Gradient/filter IDs are per-instance via useId. */
export function DragonMark({ size = 28, className = "", title }: Props) {
  const raw = useId().replace(/:/g, "");
  const grad = `dg-${raw}`;
  const glow = `dglow-${raw}`;
  return (
    <svg
      viewBox="0 0 120 100" width={size} height={size * (100 / 120)}
      className={`dragon-mark ${className}`} role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true} aria-label={title}
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00ffcc" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
        <filter id={glow} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#00ffcc" floodOpacity=".75" />
        </filter>
      </defs>
      <g filter={`url(#${glow})`} strokeLinejoin="round" strokeLinecap="round">
        {/* horns */}
        <path className="dm-draw dm-horn" pathLength={1} d="M38 30 L14 4 L30 10 L46 26 Z" fill={`url(#${grad})`} stroke={`url(#${grad})`} strokeWidth="1.5" />
        <path className="dm-draw dm-horn" pathLength={1} d="M50 24 L44 2 L58 14 L60 24 Z" fill={`url(#${grad})`} stroke={`url(#${grad})`} strokeWidth="1.5" opacity=".85" />
        {/* skull + upper jaw / angular snout */}
        <path className="dm-draw dm-skull" pathLength={1}
          d="M30 34 L50 24 L74 28 L104 38 L116 44 L108 50 L84 52 L60 56 L40 60 L26 52 L22 42 Z"
          fill="#061512" stroke={`url(#${grad})`} strokeWidth="2.4" />
        {/* upper teeth */}
        <path className="dm-draw" pathLength={1} d="M100 50 L97 56 L93 51 M88 51 L85 57 L81 52" fill="none" stroke={`url(#${grad})`} strokeWidth="1.6" />
        {/* lower jaw (articulated) */}
        <g className="dm-jaw">
          <path className="dm-draw" pathLength={1}
            d="M40 62 L62 60 L86 58 L104 56 L96 66 L72 74 L48 76 L34 68 Z"
            fill="#061512" stroke={`url(#${grad})`} strokeWidth="2.4" />
          <path className="dm-draw" pathLength={1} d="M92 59 L89 53 L86 59 M78 60 L75 54 L72 61" fill="none" stroke={`url(#${grad})`} strokeWidth="1.6" />
        </g>
        {/* neck frill / cheek spikes */}
        <path className="dm-draw" pathLength={1} d="M26 52 L8 56 L22 62 L6 72 L30 68 L40 62" fill="none" stroke={`url(#${grad})`} strokeWidth="2" />
        {/* circuit traces */}
        <path className="dm-draw dm-circuit" pathLength={1} d="M34 46 L50 46 L56 40 L76 40 M58 48 L80 48 L86 44 M44 54 L52 50" fill="none" stroke="#00ffcc" strokeWidth="1.2" />
        <circle className="dm-node" cx="76" cy="40" r="1.6" fill="#00ffcc" />
        <circle className="dm-node" cx="86" cy="44" r="1.6" fill="#00ffcc" />
        <circle className="dm-node" cx="34" cy="46" r="1.6" fill="#00ffcc" />
        {/* nostril */}
        <path d="M108 42 L112 44" stroke="#00ffcc" strokeWidth="1.4" />
        {/* eye */}
        <path className="dm-eye" d="M56 33 L70 31 L66 37 Z" fill="#eafff9" stroke="#00ffcc" strokeWidth="1" />
      </g>
    </svg>
  );
}
