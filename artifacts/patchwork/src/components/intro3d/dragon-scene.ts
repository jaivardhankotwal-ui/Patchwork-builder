// Procedural 3D emerald dragon intro. Imported lazily so `three` never ships
// with the dashboard chunk. Everything is deterministic: time is measured from
// the first rendered frame, never from module load.
import * as THREE from "three";
import { buildGlyphGeometry } from "./glyphs";

export const TIMING = {
  approach: 5.0, // pinpoint -> full size
  lettersStart: 6.0, // breakup onset, after the roar
  perLetter: 0.45, // serial region-by-region breakup stagger
  regionDissolve: 0.72, // surface of one anatomical region erodes into shards
  letterBuild: 1.25, // region onset -> letter locked in its slot
  total: 12.8,
};
const WORD = "PATCHWORK";
const GLYPH_DELAY = 0.2;
const GLYPH_FLY = TIMING.letterBuild - GLYPH_DELAY;
const LETTERS_END = TIMING.lettersStart + (WORD.length - 1) * TIMING.perLetter + TIMING.letterBuild; // 10.85

export type DragonSceneOptions = { reduced: boolean; onReady: () => void; onError: (reason: string) => void };
export type DragonSceneHandle = { dispose: () => void };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoother = (x: number) => { const t = clamp01(x); return t * t * t * (t * (t * 6 - 15) + 10); };
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function createDragonScene(host: HTMLElement, opts: DragonSceneOptions): DragonSceneHandle {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (err) {
    opts.onError(err instanceof Error ? err.message : "WebGL unavailable");
    return { dispose: () => {} };
  }
  const isPhone = Math.min(window.innerWidth, window.innerHeight) < 600;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isPhone ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const canvas = renderer.domElement;
  canvas.className = "intro3d-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040a08);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 2000);
  const target = new THREE.Vector3(0, 0.35, 0);
  const viewDir = new THREE.Vector3(0, 0.3, 1).normalize();
  let D0 = 10;

  const textures: THREE.Texture[] = [];
  const glowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(220,255,245,1)");
      grad.addColorStop(0.25, "rgba(0,255,204,0.7)");
      grad.addColorStop(1, "rgba(0,255,204,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    const t = new THREE.CanvasTexture(c);
    textures.push(t);
    return t;
  })();

  // ---------- materials ----------
  const scaleMat = new THREE.MeshStandardMaterial({ color: 0x0d3b30, roughness: 0.42, metalness: 0.35, emissive: 0x03261d, emissiveIntensity: 0.6 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0x1f6b52, roughness: 0.55, metalness: 0.15, emissive: 0x06392b, emissiveIntensity: 0.5 });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0x164f40, roughness: 0.35, metalness: 0.45, emissive: 0x0a7a5f, emissiveIntensity: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x7dffe3, roughness: 0.3, metalness: 0.2, emissive: 0x00ffcc, emissiveIntensity: 1.4 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xcfe9dd, roughness: 0.3, metalness: 0.25, emissive: 0x0b5c48, emissiveIntensity: 0.35 });
  const membraneMat = new THREE.MeshStandardMaterial({ color: 0x0f5a47, roughness: 0.6, metalness: 0.1, emissive: 0x0b4a3b, emissiveIntensity: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.88, depthWrite: false });
  const dragonMats = [scaleMat, bellyMat, boneMat, accentMat, hornMat, membraneMat];
  // Region-driven surface dissolve: each fragment belongs to the nearest region
  // anchor and is discarded cell by cell as that region's progress rises, with a
  // teal ember edge where the surface is breaking.
  const uC = Array.from({ length: 9 }, () => new THREE.Vector3(1e5, 1e5, 1e5));
  const uP: number[] = new Array(9).fill(0);
  const dissolveU = { uC: { value: uC }, uP: { value: uP } };
  for (const m of dragonMats) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uC = dissolveU.uC;
      sh.uniforms.uP = dissolveU.uP;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vDW;\nvarying vec3 vDL;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvDL = position;\nvDW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vDW;\nvarying vec3 vDL;\nuniform vec3 uC[9];\nuniform float uP[9];")
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
  float dBest = 1e9; float dPr = 0.0;
  for (int i = 0; i < 9; i++) { float dd = distance(vDW, uC[i]); if (dd < dBest) { dBest = dd; dPr = uP[i]; } }
  float dN = fract(sin(dot(floor(vDL * 11.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  if (dN < dPr) discard;
  float dEdge = dPr > 0.0 ? 1.0 - smoothstep(0.0, 0.16, dN - dPr) : 0.0;`)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.1, 1.0, 0.82) * dEdge * 1.8;");
    };
  }

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0x5fffe0, 0x020806, 0.45));
  const key = new THREE.DirectionalLight(0xd8fff4, 1.3);
  key.position.set(3, 6, 7);
  scene.add(key);
  const rimA = new THREE.DirectionalLight(0x00ffcc, 3.2);
  const rimB = new THREE.DirectionalLight(0x10b981, 2.6);
  scene.add(rimA, rimB);
  const under = new THREE.PointLight(0x0d9488, 6, 9, 1.6);
  under.position.set(0, -2.2, 2);
  scene.add(under);

  // ---------- dust field (depth cue for the approach) ----------
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dustPos = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    dustPos[i * 3] = (rnd() - 0.5) * 140;
    dustPos[i * 3 + 1] = (rnd() - 0.5) * 80;
    dustPos[i * 3 + 2] = -rnd() * 700 + 20;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x2dd4bf, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false }));
  scene.add(dust);

  // ---------- dragon ----------
  const dragon = new THREE.Group();
  scene.add(dragon);
  const body = new THREE.Group();
  dragon.add(body);
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, p?: [number, number, number], s?: [number, number, number], r?: [number, number, number]) => {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.set(...p);
    if (s) m.scale.set(...s);
    if (r) m.rotation.set(...r);
    parent.add(m);
    return m;
  };
  const sphere = (r: number) => new THREE.SphereGeometry(r, 28, 20);
  const bone = (parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat = boneMat) => {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 10), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(Y_AXIS, b.clone().sub(a).normalize());
    parent.add(m);
    return m;
  };

  // torso
  add(body, sphere(1), scaleMat, [0, 0, 0], [0.78, 0.68, 1.5]);
  add(body, sphere(1), bellyMat, [0, -0.2, 0.08], [0.6, 0.5, 1.32]);
  add(body, sphere(1), scaleMat, [0, 0.14, 0.98], [0.74, 0.74, 0.8]); // heavy chest
  add(body, sphere(1), bellyMat, [0, -0.12, 1.12], [0.56, 0.52, 0.6]); // keel
  for (const s of [-1, 1]) add(body, sphere(1), scaleMat, [s * 0.42, 0.34, 0.72], [0.36, 0.32, 0.46]); // shoulder mass
  for (let i = 0; i < 9; i++) {
    const z = 1.1 - i * 0.29;
    const y = 0.68 * Math.sqrt(Math.max(0, 1 - (z / 1.5) ** 2));
    add(body, new THREE.ConeGeometry(0.09, 0.46 - i * 0.022, 4), accentMat, [0, y + 0.12, z], undefined, [-0.6, 0, 0]);
  }
  const chestLight = new THREE.PointLight(0x00ffcc, 2, 3.5, 2);
  chestLight.position.set(0, 0.1, 1.6);
  body.add(chestLight);

  // neck chain -> head
  const neck: THREE.Group[] = [];
  let parent: THREE.Object3D = body;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0.42 : 0, i === 0 ? 1.25 : 0.27);
    parent.add(seg);
    const r = 0.33 - i * 0.025;
    add(seg, sphere(r), scaleMat, [0, 0, 0], [1, 0.95, 1.25]);
    add(seg, sphere(r * 0.8), bellyMat, [0, -r * 0.4, 0.02], [0.9, 0.7, 1.2]);
    add(seg, new THREE.ConeGeometry(0.065, 0.32, 4), accentMat, [0, r * 0.95, 0], undefined, [-0.75, 0, 0]);
    neck.push(seg);
    parent = seg;
  }
  const head = new THREE.Group();
  head.position.set(0, 0.04, 0.28);
  parent.add(head);
  add(head, sphere(1), scaleMat, [0, 0.02, 0], [0.34, 0.28, 0.38]);
  add(head, new THREE.CapsuleGeometry(0.16, 0.44, 8, 16), scaleMat, [0, 0.0, 0.42], [1.12, 0.72, 1], [Math.PI / 2, 0, 0]);
  add(head, new THREE.ConeGeometry(0.05, 0.22, 4), hornMat, [0, 0.12, 0.62], undefined, [0.9, 0, 0]); // nasal horn
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.06);
  head.add(jaw);
  add(jaw, new THREE.CapsuleGeometry(0.12, 0.44, 8, 14), bellyMat, [0, -0.02, 0.34], [1.15, 0.6, 1], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    // brow ridge slants down toward the snout centre: a scowl, not a stare
    add(head, new THREE.BoxGeometry(0.2, 0.05, 0.12), boneMat, [s * 0.13, 0.15, 0.2], undefined, [0.15, s * 0.2, s * 0.5]);
    add(head, new THREE.OctahedronGeometry(1, 0), accentMat, [s * 0.165, 0.085, 0.22], [0.085, 0.022, 0.045], [0, s * 0.25, s * 0.38]); // slit eye
    add(head, new THREE.ConeGeometry(0.09, 0.95, 6), hornMat, [s * 0.16, 0.24, -0.16], undefined, [-2.3, 0, s * -0.4]);
    add(head, new THREE.ConeGeometry(0.055, 0.5, 6), hornMat, [s * 0.25, 0.12, -0.12], undefined, [-2.0, 0, s * -0.95]);
    add(head, new THREE.ConeGeometry(0.04, 0.3, 5), hornMat, [s * 0.28, -0.05, -0.05], undefined, [-1.8, 0, s * -1.3]); // cheek spike
    add(head, sphere(0.025), accentMat, [s * 0.07, 0.07, 0.74]);
    add(head, new THREE.ConeGeometry(0.032, 0.2, 5), hornMat, [s * 0.1, -0.12, 0.58], undefined, [Math.PI, 0, 0]); // fang
    for (let k = 0; k < 3; k++) add(head, new THREE.ConeGeometry(0.02, 0.1, 5), hornMat, [s * 0.11, -0.1, 0.36 + k * 0.08], undefined, [Math.PI, 0, 0]);
    add(jaw, new THREE.ConeGeometry(0.026, 0.15, 5), hornMat, [s * 0.09, 0.07, 0.5]); // lower fang
    for (let k = 0; k < 2; k++) add(jaw, new THREE.ConeGeometry(0.018, 0.08, 5), hornMat, [s * 0.1, 0.05, 0.3 + k * 0.08]);
  }

  // wings
  type Wing = { s: number; root: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; tips: THREE.Object3D[]; back: THREE.Object3D; membrane: THREE.Mesh; pos: Float32Array };
  const ORIGIN = new THREE.Vector3();
  const buildWing = (s: number): Wing => {
    const root = new THREE.Group();
    root.position.set(s * 0.5, 0.5, 0.6);
    body.add(root);
    const upperEnd = new THREE.Vector3(s * 1.5, 0.12, -0.15);
    bone(root, ORIGIN, upperEnd, 0.11, 0.075);
    add(root, sphere(0.13), scaleMat);
    const elbow = new THREE.Group();
    elbow.position.copy(upperEnd);
    root.add(elbow);
    add(elbow, sphere(0.09), boneMat);
    const wristP = new THREE.Vector3(s * 1.35, 0.08, 0.3);
    bone(elbow, ORIGIN, wristP, 0.075, 0.055);
    const wrist = new THREE.Group();
    wrist.position.copy(wristP);
    elbow.add(wrist);
    add(wrist, sphere(0.075), boneMat);
    add(wrist, new THREE.ConeGeometry(0.04, 0.22, 8), accentMat, [s * 0.04, 0.05, 0.12], undefined, [Math.PI / 2.4, 0, 0]);
    const tips: THREE.Object3D[] = [];
    const angles = [0.12, 0.55, 1.0, 1.48];
    const lens = [2.4, 2.55, 2.25, 1.75];
    angles.forEach((a, i) => {
      const tip = new THREE.Vector3(s * Math.cos(a) * lens[i], -0.18 - i * 0.05, -Math.sin(a) * lens[i]);
      const mid = tip.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0.12, 0));
      bone(wrist, ORIGIN, mid, 0.045, 0.035);
      bone(wrist, mid, tip, 0.035, 0.012);
      add(wrist, sphere(0.04), accentMat, [mid.x, mid.y, mid.z]);
      const m = new THREE.Object3D();
      m.position.copy(tip);
      wrist.add(m);
      tips.push(m);
    });
    const back = new THREE.Object3D();
    back.position.set(s * 0.32, 0.42, -1.05);
    body.add(back);
    const pos = new Float32Array(30 * 3);
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", attr);
    const membrane = new THREE.Mesh(geo, membraneMat);
    membrane.frustumCulled = false;
    root.add(membrane);
    return { s, root, elbow, wrist, tips, back, membrane, pos };
  };
  const wings = [buildWing(-1), buildWing(1)];

  // legs
  type Leg = { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group; front: boolean; s: number };
  const buildLeg = (s: number, front: boolean): Leg => {
    const hip = new THREE.Group();
    hip.position.set(s * (front ? 0.42 : 0.5), -0.32, front ? 0.85 : -0.75);
    body.add(hip);
    const t = front ? 0.12 : 0.17;
    add(hip, new THREE.CapsuleGeometry(t, front ? 0.38 : 0.45, 6, 14), scaleMat, [0, -0.25, 0]);
    const knee = new THREE.Group();
    knee.position.set(0, front ? -0.5 : -0.58, 0);
    hip.add(knee);
    add(knee, new THREE.CapsuleGeometry(t * 0.7, 0.34, 6, 12), bellyMat, [0, -0.2, 0]);
    const ankle = new THREE.Group();
    ankle.position.set(0, -0.42, 0);
    knee.add(ankle);
    add(ankle, sphere(1), scaleMat, [0, -0.02, 0.06], [0.13, 0.07, 0.18]);
    for (const k of [-1, 0, 1]) add(ankle, new THREE.ConeGeometry(0.035, 0.24, 5), hornMat, [k * 0.075, -0.07, 0.25], undefined, [Math.PI / 2 + 0.85, 0, k * 0.25]); // hooked talons
    return { hip, knee, ankle, front, s };
  };
  const legs = [buildLeg(-1, true), buildLeg(1, true), buildLeg(-1, false), buildLeg(1, false)];

  // tail chain
  const tail: THREE.Group[] = [];
  parent = body;
  const TAIL_N = 15;
  for (let i = 0; i < TAIL_N; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0.05 : 0, i === 0 ? -1.3 : -0.3);
    parent.add(seg);
    const r = 0.34 * (1 - i / (TAIL_N + 2));
    add(seg, sphere(r), scaleMat, [0, 0, 0], [1, 0.9, 1.35]);
    add(seg, new THREE.ConeGeometry(r * 0.28, r * (i % 2 ? 0.8 : 1.15), 4), accentMat, [0, r * 0.9, 0], undefined, [-0.7, 0, 0]);
    tail.push(seg);
    parent = seg;
  }
  const spade = new THREE.Shape();
  spade.moveTo(0, 0.15); spade.lineTo(0.32, -0.25); spade.lineTo(0, -0.6); spade.lineTo(-0.32, -0.25); spade.lineTo(0, 0.15);
  add(parent, new THREE.ExtrudeGeometry(spade, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }), boneMat, [-0.025, 0, -0.1], undefined, [0, Math.PI / 2, 0]); // upright fin

  // pinpoint glow (screen-space, so it reads as a star when far away)
  const pinMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x7dffe3, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false });
  const pin = new THREE.Sprite(pinMat);
  pin.scale.set(0.035, 0.035, 1);
  body.add(pin);

  // ---------- glyphs ----------
  type Glyph = { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; halo: THREE.Sprite; width: number; detached: boolean; from: { p: THREE.Vector3; q: THREE.Quaternion; s: number } };
  // Each letter is born from one anatomical region; the anchor marks its centre.
  const mounts: Array<[THREE.Object3D, [number, number, number], [number, number, number], number]> = [
    [head, [0, 0.4, -0.04], [-0.25, 0, 0], 0.3], // P between the horns
    [neck[2], [0, -0.2, 0.14], [0.5, 0, 0], 0.26], // A on the throat
    [wings[0].elbow, [-0.8, 0.06, -0.75], [-Math.PI / 2, 0, 0], 0.46], // T left wing
    [wings[1].elbow, [0.8, 0.06, -0.75], [-Math.PI / 2, 0, 0], 0.46], // C right wing
    [body, [-0.3, -0.12, 1.38], [0, -0.2, 0], 0.3], // H chest
    [body, [0.3, -0.12, 1.38], [0, 0.2, 0], 0.3], // W chest
    [legs[0].hip, [0, -0.28, 0.16], [0, 0, 0], 0.24], // O left foreleg
    [legs[1].hip, [0, -0.28, 0.16], [0, 0, 0], 0.24], // R right foreleg
    [tail[4], [0, 0.3, 0.05], [-0.95, 0, 0], 0.3], // K tail, front tilted toward camera
  ];
  const anchors = mounts.map(([par, p, r]) => {
    const o = new THREE.Object3D();
    o.position.set(...p);
    o.rotation.set(...r);
    par.add(o);
    return o;
  });
  const glyphs: Glyph[] = WORD.split("").map((ch) => {
    const geo = buildGlyphGeometry(ch);
    const bb = geo.boundingBox!;
    const mat = new THREE.MeshStandardMaterial({ color: 0xcffff2, roughness: 0.25, metalness: 0.4, emissive: 0x00ffcc, emissiveIntensity: 0.55, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x00ffcc, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    halo.scale.set(2.6, 2.6, 1);
    halo.position.z = -0.2;
    mesh.add(halo);
    return { mesh, mat, halo, width: bb.max.x - bb.min.x, detached: false, from: { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 } };
  });

  // ---------- shards: sampled from the real dragon triangles ----------
  const SHARDS_PER = isPhone ? 24 : 40;
  const SHARD_N = SHARDS_PER * WORD.length;
  const shardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.4, emissive: 0x00ffcc, emissiveIntensity: 0.45, flatShading: true });
  const shardMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), shardMat, SHARD_N);
  shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shardMesh.frustumCulled = false;
  scene.add(shardMesh);
  type Shard = { mesh: THREE.Mesh; a: number; b: number; c: number; u: number; v: number; region: number; r: number; s0: number; lp: THREE.Vector3; spin: THREE.Vector3; sg: number; launched: boolean; p0: THREE.Vector3; out: THREE.Vector3 };
  const shards: Shard[] = [];
  const colA = new THREE.Color(0x1f6b52);
  const colB = new THREE.Color(0x7dffe3);
  const sampleGlyphPoint = (geo: THREE.BufferGeometry, out: THREE.Vector3) => {
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const idx = geo.index;
    const tris = Math.floor((idx ? idx.count : pos.count) / 3);
    const t = Math.floor(rnd() * tris) * 3;
    const vi = (k: number) => (idx ? idx.getX(t + k) : t + k);
    let u = rnd(), v = rnd();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const A = new THREE.Vector3().fromBufferAttribute(pos, vi(0));
    const B = new THREE.Vector3().fromBufferAttribute(pos, vi(1));
    const C = new THREE.Vector3().fromBufferAttribute(pos, vi(2));
    return out.copy(A).multiplyScalar(1 - u - v).addScaledVector(B, u).addScaledVector(C, v);
  };
  const sampleShards = () => {
    dragon.updateMatrixWorld(true);
    for (const w of wings) updateMembrane(w);
    const aw = anchors.map((a) => a.getWorldPosition(new THREE.Vector3()));
    type Tri = { mesh: THREE.Mesh; a: number; b: number; c: number; area: number };
    const buckets: Tri[][] = anchors.map(() => []);
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), cen = new THREE.Vector3();
    dragon.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.getAttribute("position") as THREE.BufferAttribute;
      const idx = m.geometry.index;
      const tris = Math.floor((idx ? idx.count : pos.count) / 3);
      const step = Math.max(1, Math.floor(tris / 90));
      for (let t = 0; t < tris; t += step) {
        const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        va.fromBufferAttribute(pos, a).applyMatrix4(m.matrixWorld);
        vb.fromBufferAttribute(pos, b).applyMatrix4(m.matrixWorld);
        vc.fromBufferAttribute(pos, c).applyMatrix4(m.matrixWorld);
        cen.copy(va).add(vb).add(vc).divideScalar(3);
        vb.sub(va); vc.sub(va);
        const area = vb.cross(vc).length() * 0.5 * step;
        if (area <= 1e-6) continue;
        let best = 0, bd = Infinity;
        aw.forEach((p, i) => { const d = p.distanceToSquared(cen); if (d < bd) { bd = d; best = i; } });
        buckets[best].push({ mesh: m, a, b, c, area });
      }
    });
    buckets.forEach((list, region) => {
      if (!list.length) return;
      const total = list.reduce((s, x) => s + x.area, 0);
      for (let n = 0; n < SHARDS_PER; n++) {
        let pick = rnd() * total, tri = list[0];
        for (const x of list) { pick -= x.area; if (pick <= 0) { tri = x; break; } }
        let u = rnd(), v = rnd();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const sh: Shard = {
          mesh: tri.mesh, a: tri.a, b: tri.b, c: tri.c, u, v, region, r: n / SHARDS_PER * 0.85 + rnd() * 0.15,
          s0: 0.035 + rnd() * 0.05, lp: sampleGlyphPoint(glyphs[region].mesh.geometry, new THREE.Vector3()),
          spin: new THREE.Vector3(rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3), sg: rnd() < 0.5 ? -1 : 1,
          launched: false, p0: new THREE.Vector3(), out: new THREE.Vector3(),
        };
        shardMesh.setColorAt(shards.length, tmpCol.copy(colA).lerp(colB, rnd() * 0.8));
        shards.push(sh);
      }
    });
    if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true;
  };
  const tmpCol = new THREE.Color();

  // ---------- layout ----------
  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // fit ~9 world units of wingspan horizontally, ~5.5 vertically
    D0 = Math.max(4.9 / (tanH * camera.aspect), 3.3 / tanH, 8.5);
    camera.position.copy(target).addScaledVector(viewDir, D0);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };

  const tmpV = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const slot = (i: number, out: THREE.Vector3) => {
    const dT = D0 * 0.62;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visW = 2 * dT * tanH * camera.aspect;
    const visH = 2 * dT * tanH;
    const gap = 0.16;
    const raw = glyphs.reduce((a, g) => a + g.width, 0) + gap * (glyphs.length - 1);
    const sc = Math.min((visW * 0.84) / raw, visH * 0.13);
    let x = (-raw * sc) / 2;
    for (let k = 0; k < i; k++) x += (glyphs[k].width + gap) * sc;
    x += (glyphs[i].width * sc) / 2;
    out.set(x, 0, -dT);
    camera.localToWorld(out);
    return sc;
  };

  // ---------- animation ----------
  let phase = 0;
  let last = 0;
  const pose = (t: number, dt: number) => {
    // approach: interpolate log-distance so apparent size grows evenly
    const p = smoother(t / TIMING.approach);
    const dFar = D0 * 80;
    const D = Math.exp(THREE.MathUtils.lerp(Math.log(dFar), Math.log(D0), p));
    const k = D / D0;
    dragon.position.copy(target).addScaledVector(viewDir, D0 - D);
    // screen-space drift: a lazy S-curve while approaching
    const drift = (1 - p) * k;
    dragon.position.x += Math.sin(p * Math.PI * 1.3) * 0.9 * drift;
    dragon.position.y += Math.sin(p * Math.PI) * 0.45 * drift - 0.1;
    const roar = Math.pow(Math.sin(Math.PI * clamp01((t - 4.2) / 1.9)), 0.8) + 0.45 * Math.sin(Math.PI * clamp01((t - 6.3) / 2.6));
    dragon.position.addScaledVector(viewDir, 0.35 * roar); // lunges toward the viewer
    const settle = p;
    dragon.rotation.set(
      0.18 - 0.12 * settle + 0.04 * Math.sin(t * 0.8),
      0.65 * settle + (1 - settle) * 0.55 * Math.cos(p * Math.PI * 1.3) + 0.06 * Math.sin(t * 0.55),
      -(1 - settle) * 0.35 * Math.cos(p * Math.PI * 1.3) + 0.05 * Math.sin(t * 0.7),
    );

    // wing beat: strong during flight, slower hover once full size
    const freq = THREE.MathUtils.lerp(1.6, 1.15, smoother((t - 4) / 2));
    phase += dt * freq * Math.PI * 2;
    const f = Math.sin(phase + 0.62 * Math.sin(phase)); // snapping downstroke
    const g = Math.sin(phase - 0.9);
    const amp = THREE.MathUtils.lerp(0.78, 0.62, smoother((t - 4) / 2));
    for (const w of wings) {
      w.root.rotation.set(0, w.s * (-0.08 + 0.12 * f), w.s * (0.38 + amp * f));
      w.elbow.rotation.set(0, w.s * (0.12 + 0.22 * (g * 0.5 + 0.5)), w.s * (-0.15 + 0.3 * g));
      w.wrist.rotation.set(0, w.s * (-0.06 + 0.12 * g), w.s * 0.18 * Math.sin(phase - 1.6));
    }
    body.position.y = -0.14 * f;
    body.rotation.x = 0.05 * g - 0.06 * roar; // chest heaves up into the roar

    neck.forEach((seg, i) => {
      seg.rotation.x = -0.18 + 0.06 * Math.sin(t * 1.7 - i * 0.55) - (i === 0 ? 0.25 + 0.12 * roar : 0) + (i > 2 ? roar * 0.06 : 0);
      seg.rotation.y = 0.07 * Math.sin(t * 1.1 - i * 0.45);
    });
    head.position.z = 0.28 + 0.1 * roar; // thrusting strike
    head.rotation.x = 1.1 + 0.05 * Math.sin(t * 1.7 - 3.2) - roar * 0.32;
    head.rotation.y = roar * 0.025 * Math.sin(t * 41); // snarl tremor
    jaw.rotation.x = 0.12 + 0.78 * roar;
    tail.forEach((seg, i) => {
      const w = Math.pow(0.3 + i / TAIL_N, 1.3);
      seg.rotation.y = -0.11 + 0.2 * Math.sin(t * 3.1 - i * 0.6) * w; // whip lash
      seg.rotation.x = 0.06 + 0.08 * Math.sin(t * 2.3 - i * 0.5);
    });
    for (const l of legs) {
      const sw = Math.sin(t * 1.6 + (l.front ? 0 : 1.4) + l.s * 0.5);
      // forelegs rake forward with talons clenched; hind legs braced back
      l.hip.rotation.x = (l.front ? -0.95 + l.s * 0.12 - 0.2 * roar : 1.15 - l.s * 0.1) + 0.12 * sw;
      l.hip.rotation.z = l.s * (l.front ? 0.16 : 0.3);
      l.knee.rotation.x = (l.front ? 1.35 : -1.35) + 0.12 * sw;
      l.ankle.rotation.x = (l.front ? 0.85 : 1.05) + 0.12 * Math.abs(sw);
    }

    pinMat.opacity = 1 - smoother((t - 1.5) / 3);
    chestLight.intensity = 1.6 + 1.2 * Math.sin(t * 3.1) ** 2 + roar * 2.5;
    // rim lights orbit behind the dragon for living edges
    rimA.position.set(Math.sin(t * 0.7) * 5 - 3, 3 + Math.cos(t * 0.5), -6);
    rimB.position.set(Math.cos(t * 0.6) * 4 + 4, -1 + Math.sin(t * 0.8) * 2, -5);

    // region-by-region dissolve: the body is eaten away cell by cell as shards lift off it
    let remain = 0;
    for (let i = 0; i < WORD.length; i++) {
      uP[i] = 1.08 * smoother((t - (TIMING.lettersStart + i * TIMING.perLetter)) / TIMING.regionDissolve);
      remain += 1 - Math.min(1, uP[i]);
    }
    remain /= WORD.length;
    chestLight.intensity *= remain;
    dragon.visible = remain > 0.001;
    dust.position.z = -t * 6;

    dragon.updateMatrixWorld(true);
    for (const w of wings) updateMembrane(w);
    anchors.forEach((a, i) => a.getWorldPosition(uC[i]));
    updateGlyphs(t);
    updateShards(t);
  };

  const ring: THREE.Vector3[] = Array.from({ length: 11 }, () => new THREE.Vector3());
  const wristL = new THREE.Vector3();
  const updateMembrane = (w: Wing) => {
    const loc = (o: THREE.Object3D, out: THREE.Vector3) => w.root.worldToLocal(o.getWorldPosition(out));
    loc(w.wrist, wristL);
    const tip = w.tips.map((o) => loc(o, new THREE.Vector3()));
    const back = loc(w.back, new THREE.Vector3());
    const sag = (a: THREE.Vector3, b: THREE.Vector3, toward: THREE.Vector3, amt: number, out: THREE.Vector3) =>
      out.copy(a).add(b).multiplyScalar(0.5).lerp(toward, amt);
    ring[0].copy(tip[0]);
    sag(tip[0], tip[1], wristL, 0.3, ring[1]);
    ring[2].copy(tip[1]);
    sag(tip[1], tip[2], wristL, 0.3, ring[3]);
    ring[4].copy(tip[2]);
    sag(tip[2], tip[3], wristL, 0.3, ring[5]);
    ring[6].copy(tip[3]);
    sag(tip[3], back, wristL, 0.25, ring[7]);
    ring[8].copy(back);
    ring[9].set(0, 0, 0);
    loc(w.elbow, ring[10]);
    for (let i = 0; i < 10; i++) {
      const o = i * 9;
      w.pos.set([wristL.x, wristL.y, wristL.z, ring[i].x, ring[i].y, ring[i].z, ring[i + 1].x, ring[i + 1].y, ring[i + 1].z], o);
    }
    const geo = w.membrane.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };

  const camQ = new THREE.Quaternion();
  const updateGlyphs = (t: number) => {
    camera.getWorldQuaternion(camQ);
    glyphs.forEach((g, i) => {
      const start = TIMING.lettersStart + i * TIMING.perLetter;
      if (t < start) { g.mesh.visible = false; g.detached = false; return; }
      if (!g.detached) {
        // capture the live anatomical transform at breakup onset
        g.detached = true;
        anchors[i].getWorldPosition(g.from.p);
        anchors[i].getWorldQuaternion(g.from.q);
        g.from.s = mounts[i][3] * 0.35;
      }
      g.mesh.visible = true;
      const k = clamp01((t - start - GLYPH_DELAY) / GLYPH_FLY);
      const e = easeInOutCubic(k);
      const sc = slot(i, tmpV);
      tmpA.copy(g.from.p).lerp(tmpV, e);
      // arc toward the camera mid-flight
      tmpB.copy(camera.position).sub(tmpA).normalize().multiplyScalar(Math.sin(Math.PI * e) * 0.6 * (D0 / 10));
      g.mesh.position.copy(tmpA).add(tmpB);
      g.mesh.quaternion.slerpQuaternions(g.from.q, camQ, e);
      g.mesh.scale.setScalar(THREE.MathUtils.lerp(g.from.s, sc, e));
      g.mat.opacity = smoother((t - start - 0.45) / 0.7);
      g.mesh.updateMatrixWorld();
      const since = t - (start + TIMING.letterBuild);
      const lockGlow = since >= 0 ? Math.exp(-since * 4) : 0;
      g.mat.emissiveIntensity = 0.55 + 0.35 * e + 2.6 * lockGlow;
      (g.halo.material as THREE.SpriteMaterial).opacity = 0.15 * Math.sin(Math.PI * k) + 0.9 * lockGlow + (since >= 0 ? 0.12 : 0);
    });
    const wordAlive = clamp01((t - LETTERS_END) / 0.5);
    for (const g of glyphs) if (g.detached && wordAlive > 0) g.mat.emissiveIntensity += 0.25 * wordAlive * (0.6 + 0.4 * Math.sin(t * 3));
  };

  const sm = new THREE.Matrix4();
  const sq = new THREE.Quaternion();
  const sQ = new THREE.Quaternion();
  const sE = new THREE.Euler();
  const sS = new THREE.Vector3();
  const sP = new THREE.Vector3();
  const sT = new THREE.Vector3();
  const sC = new THREE.Vector3();
  const sV = new THREE.Vector3();
  const ZERO = new THREE.Vector3(0, 0, 0);
  const updateShards = (t: number) => {
    shards.forEach((sh, j) => {
      const start = TIMING.lettersStart + sh.region * TIMING.perLetter;
      const L = start + sh.r * 0.62;
      if (t < L) {
        sh.launched = false;
        shardMesh.setMatrixAt(j, sm.compose(ZERO, sq.identity(), sS.set(0, 0, 0)));
        return;
      }
      if (!sh.launched) {
        // exact world point on the animated surface at the moment it erodes
        sh.launched = true;
        const pos = sh.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
        sh.p0.fromBufferAttribute(pos, sh.a).multiplyScalar(1 - sh.u - sh.v)
          .addScaledVector(sV.fromBufferAttribute(pos, sh.b), sh.u)
          .addScaledVector(sV.fromBufferAttribute(pos, sh.c), sh.v)
          .applyMatrix4(sh.mesh.matrixWorld);
        sh.out.copy(sh.p0).sub(uC[sh.region]);
        if (sh.out.lengthSq() < 1e-6) sh.out.set(0, 1, 0);
        sh.out.normalize();
      }
      const dur = Math.max(0.5, start + TIMING.letterBuild - 0.05 - L);
      const u = clamp01((t - L) / dur);
      const e = easeInOutCubic(u);
      const g = glyphs[sh.region];
      const sc = slot(sh.region, sT);
      sP.copy(sh.lp).multiplyScalar(sc).applyQuaternion(g.mesh.quaternion).add(g.mesh.position);
      sT.copy(sP); // live letter target
      // swirl control point: lifts off the surface, then curls around toward the letter
      sV.copy(sT).sub(sh.p0);
      sC.copy(sh.out).cross(sV).normalize().multiplyScalar(0.55 * sh.sg * (D0 / 10));
      sC.addScaledVector(sh.out, 0.75 * (D0 / 10)).add(sh.p0).addScaledVector(sV, 0.3);
      const a0 = (1 - e) * (1 - e), a1 = 2 * (1 - e) * e, a2 = e * e;
      sP.set(0, 0, 0).addScaledVector(sh.p0, a0).addScaledVector(sC, a1).addScaledVector(sT, a2);
      const after = t - (L + dur);
      const fadeOut = after > 0 ? 1 - smoother(after / 0.22) : 1;
      const sz = sh.s0 * (1 + 0.7 * Math.sin(Math.PI * Math.min(1, u * 1.4))) * THREE.MathUtils.lerp(1, 0.55, e) * fadeOut;
      sQ.setFromEuler(sE.set(sh.spin.x * (t - L), sh.spin.y * (t - L), sh.spin.z * (t - L)));
      sq.slerpQuaternions(sQ, g.mesh.quaternion, smoother((u - 0.6) / 0.4));
      shardMesh.setMatrixAt(j, sm.compose(sP, sq, sS.set(sz, sz * 0.4, sz * 0.75)));
    });
    shardMesh.instanceMatrix.needsUpdate = true;
  };

  // ---------- loop / lifecycle ----------
  let raf = 0;
  let disposed = false;
  let t0 = 0;
  const frame = (now: number) => {
    if (disposed) return;
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, Math.max(0, t - last));
    last = t;
    try {
      pose(Math.min(t, TIMING.total), dt);
      renderer.render(scene, camera);
    } catch (err) {
      opts.onError(err instanceof Error ? err.message : "Frame render failed");
      return; // stop the loop; dispose() still runs on unmount
    }
    if (t < TIMING.total + 0.5) raf = requestAnimationFrame(frame);
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    opts.onError("WebGL context lost");
  };
  canvas.addEventListener("webglcontextlost", onLost);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { resize(); if (opts.reduced) renderStatic(); }) : null;
  ro?.observe(host);
  const onWinResize = () => { resize(); if (opts.reduced) renderStatic(); };
  window.addEventListener("resize", onWinResize);

  const renderStatic = () => {
    // Reduced motion: one still frame with the word assembled and dragon dimmed.
    phase = 0;
    for (const g of glyphs) g.detached = false;
    for (const s of shards) s.launched = false;
    pose(LETTERS_END + 0.25, 0);
    renderer.render(scene, camera);
  };

  try {
    resize();
    pose(0, 0);
    sampleShards();
    if (opts.reduced) {
      phase = 0;
      pose(LETTERS_END + 0.25, 0);
      renderer.render(scene, camera);
      opts.onReady();
    } else {
      pose(0, 0);
      renderer.render(scene, camera); // compile shaders before the clock starts
      raf = requestAnimationFrame((now) => {
        t0 = now;
        last = 0;
        opts.onReady();
        frame(now);
      });
    }
  } catch (err) {
    opts.onError(err instanceof Error ? err.message : "Render failed");
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", onWinResize);
      canvas.removeEventListener("webglcontextlost", onLost);
      const mats = new Set<THREE.Material>();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => mats.add(x));
        else if (mat) mats.add(mat);
      });
      mats.forEach((m) => m.dispose());
      shardMesh.dispose();
      textures.forEach((t) => t.dispose());
      scene.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
