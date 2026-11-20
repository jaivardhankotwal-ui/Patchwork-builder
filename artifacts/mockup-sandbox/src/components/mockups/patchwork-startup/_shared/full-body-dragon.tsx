import { useId } from "react";
import { DragonMark } from "./dragon-mark";
import "./full-body-dragon.css";

type Pt = [number, number];
const tri = (...p: Pt[]) => `M${p.map((q) => q.join(" ")).join(" L")} Z`;
const TORSO = [
  tri([262, 126], [305, 128], [300, 165]), tri([262, 126], [300, 165], [255, 180]), tri([262, 126], [255, 180], [230, 120]),
  tri([230, 120], [255, 180], [200, 175]), tri([230, 120], [200, 175], [190, 135]), tri([190, 135], [200, 175], [165, 180]),
  tri([190, 135], [165, 180], [160, 150]), tri([262, 126], [230, 120], [250, 112]),
];
const DORSAL = [tri([230, 120], [222, 102], [214, 125]), tri([190, 135], [180, 116], [175, 140]), tri([250, 112], [246, 96], [238, 116])];
const FORE_LEG = [tri([290, 160], [305, 195], [282, 175]), tri([305, 195], [282, 175], [290, 205])];
const HIND_LEG = [tri([200, 175], [165, 180], [185, 210]), tri([185, 210], [165, 180], [170, 225]), tri([170, 225], [198, 228], [185, 212])];
const CLAWS = [tri([290, 205], [300, 214], [295, 203]), tri([305, 195], [317, 204], [306, 201]), tri([198, 228], [209, 235], [196, 232]), tri([186, 228], [191, 239], [181, 231]), tri([172, 225], [168, 237], [166, 226])];
const TAIL = [
  tri([160, 150], [165, 180], [120, 175]), tri([120, 175], [160, 150], [110, 160]), tri([110, 160], [120, 175], [70, 190]),
  tri([70, 190], [110, 160], [60, 175]), tri([70, 190], [60, 175], [25, 215]), tri([25, 215], [4, 244], [36, 205]),
  tri([25, 215], [2, 222], [20, 206]), tri([110, 160], [100, 143], [94, 164]), tri([60, 175], [47, 159], [51, 182]), tri([120, 175], [114, 192], [100, 180]),
];
const WING = [
  tri([240, 122], [252, 60], [200, 20]), tri([240, 122], [200, 20], [130, 40]), tri([240, 122], [130, 40], [160, 95]),
  tri([160, 95], [130, 40], [90, 90]), tri([240, 122], [160, 95], [195, 125]), tri([160, 95], [90, 90], [140, 118]),
  tri([200, 20], [210, 3], [196, 23]), tri([130, 40], [124, 26], [136, 42]),
];
const BONES = "M240 122 L252 60 L200 20 M240 122 L130 40 M240 122 L160 95 L90 90";
const SHADES = ["#060b0a", "#0a1412", "#0d1a17", "#071210"];

export function FullBodyDragon({ className = "" }: { className?: string }) {
  const raw = useId().replace(/:/g, "");
  const edge = `url(#fbg-${raw})`;
  const f = (list: string[], k: string, o = 0) => list.map((d, i) => (
    <path key={k + i} d={d} fill={SHADES[(i + o) % SHADES.length]} stroke={edge} strokeWidth="1.1" />
  ));
  const claw = (list: string[]) => list.map((d, i) => <path key={"c" + i} d={d} fill="#bffff0" stroke="#00ffcc" strokeWidth=".6" />);
  return (
    <svg viewBox="0 0 420 280" className={`fb-dragon ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={`fbg-${raw}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#00ffcc" /><stop offset="1" stopColor="#10b981" /></linearGradient>
        <filter id={`fbglow-${raw}`} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#00ffcc" floodOpacity=".45" /></filter>
      </defs>
      <g filter={`url(#fbglow-${raw})`} strokeLinejoin="round">
        <g transform="translate(34 4)" opacity=".5"><g className="fb-wing fb-wing-far">{f(WING, "wf", 1)}</g></g>
        <g className="fb-tail">{f(TAIL, "t")}</g>
        <g className="fb-body">{f(HIND_LEG, "hl", 2)}{f(TORSO, "b")}{f(DORSAL, "d", 1)}{f(FORE_LEG, "fl", 3)}{claw(CLAWS)}</g>
        <g className="fb-wing fb-wing-near">{f(WING, "wn")}<path d={BONES} fill="none" stroke="#00ffcc" strokeWidth="1.3" opacity=".8" /></g>
      </g>
      <g transform="translate(250 10)"><DragonMark size={120} /></g>
    </svg>
  );
}
