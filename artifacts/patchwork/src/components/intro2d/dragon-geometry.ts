// Intro-only copy of the exact FullBodyDragon + DragonMark facet geometry,
// split into animatable groups. Source of truth: full-body-dragon.tsx / dragon-mark.tsx.
type Pt = [number, number];
const tri = (...p: Pt[]) => p;

export type Group = "wingFar" | "tail" | "body" | "wingNear" | "neck" | "jaw" | "head";
export type Facet = { pts: Pt[]; group: Group; fill: string; light?: boolean };

const SHADES = ["#060b0a", "#0a1412", "#0d1a17", "#071210"];

// ---- Full body (viewBox 0 0 420 280)
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
export const BONES = "M240 122 L252 60 L200 20 M240 122 L130 40 M240 122 L160 95 L90 90";

// ---- DragonMark head (viewBox 0 0 120 120), docked at translate(250,10)
const K: Pt = [36, 40], A: Pt = [44, 30], B: Pt = [58, 27], C: Pt = [73, 33], D: Pt = [96, 40], E: Pt = [115, 46];
const F: Pt = [101, 54], M: Pt = [66, 58], G: Pt = [50, 56], I: Pt = [61, 44], J: Pt = [85, 46];
const HORNS = [tri([3, 5], A, [30, 30]), tri([30, 30], A, K), tri([22, 0], B, A), tri([22, 0], A, [36, 22])];
const HEAD = [tri(K, A, I), tri(A, B, I), tri(B, C, I), tri(I, C, J), tri(C, D, J), tri(D, E, F), tri(D, F, J), tri(J, F, M), tri(I, J, M), tri(I, M, G), tri(K, I, G)];
const UPPER_TEETH = [tri([97, 54], [93, 61], [89, 55]), tri([85, 56], [81, 63], [77, 57])];
const P: Pt = [80, 62], JT: Pt = [108, 60], L: Pt = [84, 71], N: Pt = [60, 72];
const JAW = [tri(M, P, N), tri(M, JT, P), tri(P, JT, L), tri(P, L, N)];
const LOWER_TEETH = [tri([101, 60], [98, 53], [95, 60]), tri([90, 61], [87, 54], [84, 62])];
const S1: Pt = [26, 62], S2: Pt = [46, 76], Q: Pt = [57, 72], S3: Pt = [18, 90], S4: Pt = [38, 98], S5: Pt = [53, 92];
const NECK = [tri(K, G, S1), tri(G, Q, S2), tri(G, S2, S1), tri(S1, S2, S3), tri(S2, S4, S3), tri(S2, Q, S5), tri(S2, S5, S4),
  tri(S3, S4, [12, 118]), tri(S4, [34, 118], [12, 118]), tri(S4, S5, [34, 118]), tri(S5, [55, 118], [34, 118])];
const SPIKES = [tri(K, [14, 44], [30, 52]), tri(S1, [6, 68], [22, 76]), tri(S3, [1, 98], [15, 104]), tri([31, 52], [16, 56], S1)];
export const HEAD_OFFSET: Pt = [250, 10];
export const EYE: Pt[] = [[59, 38], [76, 36], [66, 41]];
export const CIRCUIT = "M40 44 L52 48 L61 44 M85 46 L92 50";

const facets = (list: Pt[][], group: Group, o = 0): Facet[] =>
  list.map((pts, i) => ({ pts, group, fill: SHADES[(i + o) % SHADES.length] }));
const light = (list: Pt[][], group: Group): Facet[] => list.map((pts) => ({ pts, group, fill: "#bffff0", light: true }));

export const FACETS: Facet[] = [
  ...facets(WING, "wingFar", 1),
  ...facets(TAIL, "tail"),
  ...facets(HIND_LEG, "body", 2), ...facets(TORSO, "body"), ...facets(DORSAL, "body", 1), ...facets(FORE_LEG, "body", 3), ...light(CLAWS, "body"),
  ...facets(WING, "wingNear"),
  ...facets(SPIKES, "neck", 1), ...facets(NECK, "neck"),
  ...facets(JAW, "jaw", 2), ...light(LOWER_TEETH, "jaw"),
  ...facets(HORNS, "head"), ...facets(HEAD, "head"), ...light(UPPER_TEETH, "head"),
];

export const toD = (pts: Pt[]) => `M${pts.map((q) => q.join(" ")).join(" L")} Z`;

// ---- Futuristic cut-corner monoline glyphs (cell 100 x 140)
export const GLYPHS: Record<string, string> = {
  P: "M0 140 V0 H82 L100 18 V58 L82 76 H16 M0 76 V140",
  A: "M0 140 V30 L30 0 H70 L100 30 V140 M0 84 H100",
  T: "M0 0 H100 M50 0 V140 M38 140 H62",
  C: "M100 0 H22 L0 22 V118 L22 140 H100",
  H: "M0 0 V140 M100 0 V140 M0 70 H100",
  W: "M0 0 V118 L22 140 L50 112 L78 140 L100 118 V0 M50 112 V56",
  O: "M22 0 H78 L100 22 V118 L78 140 H22 L0 118 V22 Z",
  R: "M0 140 V0 H82 L100 18 V54 L82 72 H0 M54 72 L100 122 V140",
  K: "M0 0 V140 M100 0 L44 70 L100 140 M0 70 H44",
};
