import { Canvas, useFrame, useThree } from "@react-three/fiber";
// @ts-expect-error Three is installed as a runtime-only package in this workspace.
import * as THREE from "three";
import { useMemo, useRef } from "react";

const WORD = "PATCHWORK";
const ANCHORS: Record<string, [number, number, number]> = {
  P: [3.15, 1.18, 0.42], A: [1.9, 0.68, 0.2], T: [-0.15, 2.38, 0.1],
  C: [1.15, 2.1, 0.12], H: [0.15, 0.1, 0.5], W: [-0.9, 0.08, 0.48],
  O: [-1.8, -1.05, 0.26], R: [1.5, -1.1, 0.35], K: [-3.4, -0.7, 0.2],
};
const LETTER_SPACING = 0.79;
const targetLetter = (index: number, narrow: boolean): any => {
  const scale = narrow ? 0.65 : 0.78;
  const width = (WORD.length - 1) * LETTER_SPACING * scale;
  return new THREE.Vector3(2.7 - width / 2 + index * LETTER_SPACING * scale, narrow ? -2.65 : -2.15, 0.38);
};

// Each character is a set of extruded geometric strokes, authored locally (no network font).
const STROKES: Record<string, number[][][]> = {
  P: [[[0,0],[.15,0],[.15,1],[0,1]], [[.12,.85],[.72,.85],[.72,.7],[.12,.7]], [[.57,.85],[.72,.85],[.72,.52],[.57,.52]], [[.12,.52],[.72,.52],[.72,.37],[.12,.37]]],
  A: [[[0,0],[.15,0],[.15,1],[0,1]], [[.58,0],[.73,0],[.73,1],[.58,1]], [[.12,.55],[.61,.55],[.61,.4],[.12,.4]], [[.12,1],[.61,1],[.61,.85],[.12,.85]]],
  T: [[[.28,0],[.43,0],[.43,1],[.28,1]], [[0,1],[.72,1],[.72,.84],[0,.84]]],
  C: [[[0,0],[.16,0],[.16,1],[0,1]], [[.12,1],[.72,1],[.72,.84],[.12,.84]], [[.12,.16],[.72,.16],[.72,0],[.12,0]]],
  H: [[[0,0],[.15,0],[.15,1],[0,1]], [[.58,0],[.73,0],[.73,1],[.58,1]], [[.12,.56],[.61,.56],[.61,.41],[.12,.41]]],
  W: [[[0,0],[.14,0],[.14,1],[0,1]], [[.59,0],[.73,0],[.73,1],[.59,1]], [[.12,.19],[.27,.19],[.27,.56],[.12,.56]], [[.46,.19],[.61,.19],[.61,.56],[.46,.56]], [[.12,.19],[.62,.19],[.62,0],[.12,0]]],
  O: [[[0,0],[.15,0],[.15,1],[0,1]], [[.58,0],[.73,0],[.73,1],[.58,1]], [[.12,1],[.61,1],[.61,.85],[.12,.85]], [[.12,.15],[.61,.15],[.61,0],[.12,0]]],
  R: [[[0,0],[.15,0],[.15,1],[0,1]], [[.12,.85],[.69,.85],[.69,.7],[.12,.7]], [[.55,.85],[.7,.85],[.7,.52],[.55,.52]], [[.12,.52],[.69,.52],[.69,.37],[.12,.37]], [[.43,.38],[.6,.38],[.76,0],[.59,0]]],
  K: [[[0,0],[.15,0],[.15,1],[0,1]], [[.14,.51],[.34,.51],[.72,.98],[.55,.98]], [[.14,.49],[.34,.49],[.72,.02],[.55,.02]]],
};

function ExtrudedLetter({ letter, index, start, reduced }: { letter: string; index: number; start: number; reduced: boolean }) {
  const group = useRef<any>(null);
  const anchor = useMemo(() => new THREE.Vector3(...ANCHORS[letter]), [letter]);
  const desktopDock = useMemo(() => targetLetter(index, false), [index]);
  const mobileDock = useMemo(() => targetLetter(index, true), [index]);
  const geometries = useMemo(() => STROKES[letter].map((poly) => {
    const shape = new THREE.Shape();
    poly.forEach(([x, y], point) => point ? shape.lineTo(x - 0.36, y - 0.5) : shape.moveTo(x - 0.36, y - 0.5));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.13, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.025, bevelThickness: 0.025 });
    geometry.computeVertexNormals();
    return geometry;
  }), [letter]);
  useFrame(({ clock, size }) => {
    if (!group.current) return;
    const elapsed = clock.elapsedTime;
    const narrow = size.width < 700;
    const dock = narrow ? mobileDock : desktopDock;
    const flight = reduced ? 1 : THREE.MathUtils.smoothstep(elapsed, start + index * 0.19, start + index * 0.19 + 0.72);
    group.current.position.lerpVectors(anchor, dock, flight);
    group.current.rotation.set((1 - flight) * (index % 2 ? -0.22 : 0.22), (1 - flight) * 0.45, (1 - flight) * (index % 2 ? -0.3 : 0.3));
    const sizeFactor = THREE.MathUtils.lerp(0.56, narrow ? 0.54 : 0.78, flight);
    group.current.scale.setScalar(sizeFactor);
    const mats = group.current.children as any[];
    for (let i = 0; i < mats.length; i += 1) {
      const mesh = mats[i];
      const material = mesh.material as any;
      material.emissiveIntensity = THREE.MathUtils.lerp(0.42, 0.8, flight);
      material.opacity = THREE.MathUtils.lerp(0.72, 1, flight);
    }
  });
  return <group ref={group}>{geometries.map((geometry, i) => <mesh key={i} geometry={geometry} castShadow>
    <meshStandardMaterial color="#b9fff0" emissive="#00b995" emissiveIntensity={0.7} metalness={0.62} roughness={0.24} />
  </mesh>)}</group>;
}

function Facet({ position, scale, color = "#10241f", rotation = [0, 0, 0] }: {
  position: [number, number, number]; scale: [number, number, number]; color?: string; rotation?: [number, number, number];
}) {
  return <mesh position={position} scale={scale} rotation={rotation} castShadow>
    <icosahedronGeometry args={[1, 1]} />
    <meshStandardMaterial color={color} metalness={0.65} roughness={0.34} emissive="#06352c" emissiveIntensity={0.28} flatShading />
  </mesh>;
}

function Wing({ far = false, reduced = false }: { far?: boolean; reduced?: boolean }) {
  const pivot = useRef<any>(null);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(-0.42, 1.6); shape.lineTo(-1.1, 2.65);
    shape.lineTo(-0.12, 2.1); shape.lineTo(0.75, 2.95); shape.lineTo(0.48, 1.75);
    shape.lineTo(1.15, 2.12); shape.lineTo(0.72, 1.1); shape.lineTo(0.2, 0.1); shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  }, []);
  useFrame(({ clock }) => {
    if (!pivot.current) return;
    const t = clock.elapsedTime;
    const flight = reduced ? 1 : THREE.MathUtils.smoothstep(t, 0.4, 3.2);
    const flap = reduced ? 0 : Math.sin(t * 4.3) * 0.17 * (t < 4.4 ? 1 : 0.28);
    pivot.current.rotation.z = -0.06 + flap + (1 - flight) * 0.26;
    pivot.current.rotation.x = reduced ? 0 : (far ? -1 : 1) * (0.12 + Math.sin(t * 4.3) * 0.12);
  });
  return <group ref={pivot} position={[0.35, 0.5, far ? -0.32 : 0.42]} scale={far ? 0.96 : 1}>
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color={far ? "#0b1916" : "#10251f"} metalness={0.55} roughness={0.38} emissive="#08745b" emissiveIntensity={far ? 0.18 : 0.42} side={THREE.DoubleSide} />
    </mesh>
    {[[0,0,0],[-.42,1.6,0],[-1.1,2.65,0],[-.12,2.1,0],[.75,2.95,0],[.48,1.75,0],[1.15,2.12,0],[.72,1.1,0]].map((p, i) => <mesh key={i} position={p as [number, number, number]}>
      <sphereGeometry args={[i === 0 ? 0.045 : 0.025, 8, 6]} />
      <meshBasicMaterial color="#54ffe0" />
    </mesh>)}
  </group>;
}

function Dragon({ reduced }: { reduced: boolean }) {
  const root = useRef<any>(null);
  const body = useRef<any>(null);
  const { size } = useThree();
  useFrame(({ clock }) => {
    if (!root.current || !body.current) return;
    const t = clock.elapsedTime;
    const narrow = size.width < 700;
    const flight = reduced ? 1 : THREE.MathUtils.smoothstep(t, 0.05, 3.5);
    const settle = reduced ? 1 : THREE.MathUtils.smoothstep(t, 3.1, 4.2);
    const endX = narrow ? 0 : -3.35;
    const endY = narrow ? 0.55 : 0.48;
    root.current.position.set(THREE.MathUtils.lerp(0, endX, settle), THREE.MathUtils.lerp(0, endY, settle) + (reduced ? 0 : Math.sin(t * 2.1) * 0.035), THREE.MathUtils.lerp(-10, 0, flight));
    const wideScale = narrow ? 0.67 : 0.91;
    root.current.scale.setScalar(THREE.MathUtils.lerp(0.12, wideScale, flight));
    body.current.rotation.z = reduced ? 0 : Math.sin(t * 2.3) * 0.035;
  });
  return <group ref={root}>
    <group ref={body}>
      <Wing far reduced={reduced} />
      {/* Torso, articulated neck, angular head, limbs and tapering segmented tail. */}
      <Facet position={[0, 0, 0]} scale={[1.62, 0.7, 0.58]} color="#11251f" />
      <Facet position={[1.38, 0.52, 0.04]} scale={[0.98, 0.32, 0.34]} rotation={[0,0,-0.38]} color="#16342c" />
      <Facet position={[2.56, 0.89, 0.1]} scale={[0.68, 0.42, 0.42]} color="#1b3a31" />
      <Facet position={[3.1, 0.72, 0.16]} scale={[0.57, 0.2, 0.31]} rotation={[0,0,-0.06]} color="#10241f" />
      <mesh position={[2.38, 1.36, 0.1]} rotation={[0,0,-0.22]}><coneGeometry args={[0.2,0.78,5]} /><meshStandardMaterial color="#49e6c2" emissive="#00b994" emissiveIntensity={0.5} metalness={0.45} /></mesh>
      <mesh position={[2.8, 1.33, 0.1]} rotation={[0,0,-0.55]}><coneGeometry args={[0.15,0.58,5]} /><meshStandardMaterial color="#66f7d6" metalness={0.4} /></mesh>
      <mesh position={[3.28, 0.92, 0.43]}><sphereGeometry args={[0.065,12,8]} /><meshBasicMaterial color="#cafff5" /></mesh>
      <Facet position={[-1.38,-0.03,-0.02]} scale={[1.12,0.48,0.43]} rotation={[0,0,-0.14]} color="#0c1b17" />
      <Facet position={[-2.35,-0.3,0]} scale={[0.9,0.3,0.28]} rotation={[0,0,-0.24]} color="#10251f" />
      <Facet position={[-3.18,-0.6,0]} scale={[0.7,0.2,0.21]} rotation={[0,0,-0.32]} color="#173b31" />
      <mesh position={[-3.8,-0.84,0]} rotation={[0,0,-0.6]}><coneGeometry args={[0.27,1.0,5]} /><meshStandardMaterial color="#36c8a5" emissive="#08765d" emissiveIntensity={0.25} /></mesh>
      <Facet position={[1.05,-0.78,0.14]} scale={[0.26,0.65,0.26]} rotation={[0,0,-0.3]} color="#1a3b31" />
      <Facet position={[1.14,-1.25,0.14]} scale={[0.43,0.17,0.28]} rotation={[0,0,0.05]} color="#16352c" />
      <Facet position={[-1.23,-0.75,0.22]} scale={[0.28,0.7,0.28]} rotation={[0,0,0.28]} color="#19372e" />
      <Facet position={[-1.36,-1.24,0.22]} scale={[0.45,0.17,0.28]} rotation={[0,0,-0.08]} color="#16352c" />
      <Wing reduced={reduced} />
      {[[-.9,.45],[ -.35,.58],[.25,.55],[.78,.42]].map(([x,y],i)=><mesh key={i} position={[x,y,0.1]} rotation={[0,0,Math.PI/2]}><coneGeometry args={[0.12,0.42,4]} /><meshStandardMaterial color="#48d9b6" emissive="#08765d" emissiveIntensity={0.25} /></mesh>)}
    </group>
  </group>;
}

function FlightTimeline({ reduced }: { reduced: boolean }) {
  const lettersStart = reduced ? 0.1 : 4.35;
  return <><Dragon reduced={reduced} />{WORD.split("").map((letter, index) => <ExtrudedLetter key={index} letter={letter} index={index} start={lettersStart} reduced={reduced} />)}</>;
}

export function DragonFlightScene({ reduced }: { reduced: boolean }) {
  return <div className={`dragon-flight-canvas ${reduced ? "dragon-flight-canvas-reduced" : ""}`} aria-hidden="true">
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 16], fov: 40 }} gl={{ alpha: true, antialias: true, powerPreference: "low-power" }} fallback={<div className="intro-canvas-fallback" />}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 7, 8]} intensity={2.2} color="#baffef" />
      <pointLight position={[-4, 1, 3]} intensity={17} distance={15} color="#00d9ad" />
      <pointLight position={[3, -3, -2]} intensity={8} distance={12} color="#087d62" />
      <FlightTimeline reduced={reduced} />
    </Canvas>
  </div>;
}
