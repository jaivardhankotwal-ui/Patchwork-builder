// Procedural stencil-style extruded glyphs (no font files needed).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type V = [number, number];
const S = 0.2; // stroke

const rect = (x: number, y: number, w: number, h: number) => {
  const s = new THREE.Shape();
  s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + h); s.lineTo(x, y + h); s.closePath();
  return s;
};
const line = (a: V, b: V, w = S) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (w / 2), ny = (dx / l) * (w / 2);
  const s = new THREE.Shape();
  s.moveTo(a[0] + nx, a[1] + ny); s.lineTo(b[0] + nx, b[1] + ny); s.lineTo(b[0] - nx, b[1] - ny); s.lineTo(a[0] - nx, a[1] - ny); s.closePath();
  return s;
};
const band = (cx: number, cy: number, ro: number, ri: number, a0: number, a1: number) => {
  const s = new THREE.Shape();
  const r0 = THREE.MathUtils.degToRad(a0), r1 = THREE.MathUtils.degToRad(a1);
  if (a1 - a0 >= 360) {
    s.absarc(cx, cy, ro, 0, Math.PI * 2, false);
    const h = new THREE.Path();
    h.absarc(cx, cy, ri, 0, Math.PI * 2, true);
    s.holes.push(h);
    return s;
  }
  s.absarc(cx, cy, ro, r0, r1, false);
  s.absarc(cx, cy, ri, r1, r0, true);
  s.closePath();
  return s;
};

const LETTERS: Record<string, () => THREE.Shape[]> = {
  P: () => [rect(0, 0, S, 1), rect(0, 0.8, 0.36, S), rect(0, 0.4, 0.36, S), band(0.36, 0.7, 0.3, 0.1, -90, 90)],
  A: () => [line([0.08, 0], [0.4, 1]), line([0.72, 0], [0.4, 1]), rect(0.2, 0.3, 0.4, 0.17)],
  T: () => [rect(0, 0.8, 0.76, S), rect(0.28, 0, S, 1)],
  C: () => [band(0.5, 0.5, 0.5, 0.3, 45, 315)],
  H: () => [rect(0, 0, S, 1), rect(0.52, 0, S, 1), rect(0, 0.41, 0.72, 0.18)],
  W: () => [line([0.04, 1], [0.26, 0]), line([0.26, 0], [0.5, 0.72]), line([0.5, 0.72], [0.74, 0]), line([0.74, 0], [0.96, 1])],
  O: () => [band(0.5, 0.5, 0.5, 0.3, 0, 360)],
  R: () => [...LETTERS.P(), line([0.32, 0.46], [0.7, 0], 0.21)],
  K: () => [rect(0, 0, S, 1), line([0.12, 0.42], [0.66, 1]), line([0.26, 0.52], [0.7, 0])],
};

export function buildGlyphGeometry(ch: string) {
  const shapes = (LETTERS[ch] ?? LETTERS.O)();
  const parts = shapes.map((s) => new THREE.ExtrudeGeometry(s, { depth: 0.24, curveSegments: 18, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.025, bevelSegments: 2 }));
  const merged = mergeGeometries(parts) ?? parts[0];
  if (merged !== parts[0]) parts.forEach((p) => p.dispose());
  merged.computeBoundingBox();
  merged.center();
  return merged;
}
