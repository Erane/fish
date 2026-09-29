import { TAU, randomSeed } from "../core/index.ts";

export type ShapeKind =
  | "sand"
  | "sandPatch"
  | "stone"
  | "moss"
  | "rock"
  | "mossCap"
  | "penny"
  | "leaf"
  | "flower"
  | "bud"
  | "heart";

export interface BedShape {
  kind: ShapeKind;
  x: number;
  y: number;
  size: number;
  rot: number;
  poly: number[];
  fill: string;
  z: number;
  above: number;
  shadow: number;
  wet: number;
}

export const BED_COLORS = {
  water: "#9dc0ab",
  sand: "#a3c2ad",
  sandLight: "#a9c8b3",
  sandDark: "#98b9a4",
  weed: "#83a87f",
  stone: "#87a29b",
  stoneDark: "#77948d",
  stoneLight: "#94ada5",
  moss: "#7c9c5e",
  mossDark: "#698a4e",
  mossLight: "#90ad6c",
  rock: "#a8b0a6",
  rockDark: "#87918a",
  rockLight: "#b8bfb3",
  leaf: "#7d9b5e",
  leafDark: "#6c8b50",
  leafLight: "#8fa96b",
  penny: "#87a86b",
  petal: "#e9bcc9",
  petalLight: "#f3d3dc",
  petalDeep: "#d9a2b3",
  heart: "#e5c469",
} as const;

const Z = {
  sand: 0,
  sandPatch: 1,
  stone: 2,
  moss: 3,
  rock: 4,
  mossCap: 5,
  penny: 6,
  leaf: 7,
  bud: 8,
  flower: 9,
  heart: 10,
} as const;

type Rng = () => number;

function blob(rng: Rng, points: number, irr: number): number[] {
  const poly: number[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * TAU;
    const r = 1 + (rng() - 0.5) * irr;
    poly.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return poly;
}

// A lily pad: a disc with a narrow slit cut from the rim toward the centre.
function padPoly(rng: Rng, notch: number): number[] {
  const gap = 0.16 + rng() * 0.1;
  const poly: number[] = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const a = notch + gap + (i / steps) * (TAU - gap * 2);
    const r = 1 + (rng() - 0.5) * 0.06;
    poly.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  poly.push(Math.cos(notch) * 0.18, Math.sin(notch) * 0.18);
  return poly;
}

// A blossom seen from above: rounded petals radiating from the centre.
function petalPoly(rng: Rng, petals: number, inner: number): number[] {
  const poly: number[] = [];
  for (let i = 0; i < petals; i++) {
    const a0 = (i / petals) * TAU;
    const a1 = ((i + 1) / petals) * TAU;
    const tip = 1 + (rng() - 0.5) * 0.1;
    for (const t of [0.2, 0.5, 0.8]) {
      const a = a0 + (a1 - a0) * t;
      const r = inner + (tip - inner) * Math.sin(Math.PI * t);
      poly.push(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  return poly;
}

function shape(
  kind: ShapeKind,
  x: number,
  y: number,
  size: number,
  rot: number,
  poly: number[],
  fill: string,
  above = 0,
  shadow = 0,
  wet = 0,
): BedShape {
  return { kind, x, y, size, rot, poly, fill, z: Z[kind], above, shadow, wet };
}

function push(list: BedShape[], s: BedShape): void {
  list.push(s);
}

// A bank cluster: boulder, moss collar, lotus pads, a blossom and pennywort, hugging one corner or edge.
function cluster(
  rng: Rng,
  list: BedShape[],
  cx: number,
  cy: number,
  spread: number,
  big: boolean,
): void {
  const jx = () => (rng() - 0.5) * spread;
  const jy = () => (rng() - 0.5) * spread;
  if (rng() < 0.8) {
    const rx = cx + jx() * 1.3;
    const ry = cy + jy() * 1.3;
    const rs = (big ? 0.09 : 0.06) * (0.8 + rng() * 0.5);
    push(
      list,
      shape(
        "rock",
        rx,
        ry,
        rs,
        rng() * TAU,
        blob(rng, 9, 0.4),
        rng() < 0.5 ? BED_COLORS.rock : BED_COLORS.rockLight,
        1,
        0.4,
        0.8,
      ),
    );
    push(
      list,
      shape(
        "rock",
        rx - rs * 0.3,
        ry + rs * 0.3,
        rs * 0.7,
        rng() * TAU,
        blob(rng, 8, 0.4),
        BED_COLORS.rockDark,
        1,
        0.4,
        0.8,
      ),
    );
    push(
      list,
      shape(
        "mossCap",
        rx + rs * 0.1,
        ry - rs * 0.35,
        rs * 0.75,
        rng() * TAU,
        blob(rng, 10, 0.7),
        BED_COLORS.moss,
        1,
        0.4,
        0.8,
      ),
    );
  }
  const leaves = big ? 5 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 2);
  for (let i = 0; i < leaves; i++) {
    const lx = cx + jx();
    const ly = cy + jy();
    const ls = (big ? 0.075 : 0.05) * (0.6 + rng() * 0.8);
    const tone = rng();
    push(
      list,
      shape(
        "leaf",
        lx,
        ly,
        ls,
        rng() * TAU,
        padPoly(rng, rng() * TAU),
        tone < 0.34 ? BED_COLORS.leafDark : tone < 0.7 ? BED_COLORS.leaf : BED_COLORS.leafLight,
        1,
        1,
        1,
      ),
    );
  }
  if (rng() < 0.85) {
    const fx = cx + jx() * 0.8;
    const fy = cy + jy() * 0.8;
    const fs = (big ? 0.045 : 0.032) * (0.8 + rng() * 0.4);
    const fr = rng() * TAU;
    push(list, shape("flower", fx, fy, fs, fr, petalPoly(rng, 8, 0.4), BED_COLORS.petal, 1, 1, 0));
    push(
      list,
      shape(
        "flower",
        fx,
        fy,
        fs * 0.66,
        fr + 0.4,
        petalPoly(rng, 7, 0.4),
        BED_COLORS.petalLight,
        1,
        1,
        0,
      ),
    );
    push(
      list,
      shape("heart", fx, fy, fs * 0.22, 0, blob(rng, 10, 0.15), BED_COLORS.heart, 1, 1, 0),
    );
  }
  if (rng() < 0.6)
    push(
      list,
      shape(
        "bud",
        cx + jx(),
        cy + jy(),
        0.02 * (0.8 + rng() * 0.5),
        rng() * TAU,
        petalPoly(rng, 5, 0.3),
        BED_COLORS.petalDeep,
        1,
        1,
        0,
      ),
    );
  const pennies = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < pennies; i++)
    push(
      list,
      shape(
        "penny",
        cx + jx() * 1.3,
        cy + jy() * 1.3,
        0.016 * (0.6 + rng() * 0.8),
        rng() * TAU,
        blob(rng, 10, 0.12),
        BED_COLORS.penny,
        1,
        1,
        1,
      ),
    );
}

// Submerged stones and moss that read through the water, ringed around the open middle.
function underwater(rng: Rng, list: BedShape[]): void {
  const ring: [number, number][] = [
    [0.2, 0.12],
    [0.4, 0.06],
    [0.62, 0.1],
    [0.8, 0.2],
    [0.86, 0.5],
    [0.78, 0.8],
    [0.55, 0.9],
    [0.32, 0.86],
    [0.14, 0.68],
    [0.1, 0.35],
  ];
  for (const [bx, by] of ring) {
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const x = bx + (rng() - 0.5) * 0.14;
      const y = by + (rng() - 0.5) * 0.14;
      const s = 0.012 + rng() * 0.03;
      const tone = rng();
      push(
        list,
        shape(
          "stone",
          x,
          y,
          s,
          rng() * TAU,
          blob(rng, 10, 0.35),
          tone < 0.4 ? BED_COLORS.stoneDark : tone < 0.8 ? BED_COLORS.stone : BED_COLORS.stoneLight,
        ),
      );
      if (rng() < 0.7)
        push(
          list,
          shape(
            "moss",
            x + (rng() - 0.5) * 0.05,
            y + (rng() - 0.5) * 0.05,
            s * (0.7 + rng() * 0.7),
            rng() * TAU,
            blob(rng, 11, 0.8),
            rng() < 0.5 ? BED_COLORS.mossDark : BED_COLORS.moss,
          ),
        );
    }
  }
}

function sandBed(rng: Rng, list: BedShape[]): void {
  push(
    list,
    shape("sand", 0.5, 0.5, 1.6, 0, [-1.2, -1.2, 1.2, -1.2, 1.2, 1.2, -1.2, 1.2], BED_COLORS.water),
  );
  for (let i = 0; i < 26; i++) {
    const tone = rng();
    push(
      list,
      shape(
        "sandPatch",
        rng(),
        rng(),
        0.05 + rng() * 0.1,
        rng() * TAU,
        blob(rng, 12, 0.35),
        tone < 0.4 ? BED_COLORS.sandLight : tone < 0.75 ? BED_COLORS.sand : BED_COLORS.sandDark,
      ),
    );
  }
  for (let i = 0; i < 5; i++) {
    const wx = 0.22 + rng() * 0.56;
    const wy = 0.18 + rng() * 0.64;
    const tufts = 2 + Math.floor(rng() * 2);
    for (let t = 0; t < tufts; t++)
      push(
        list,
        shape(
          "moss",
          wx + (rng() - 0.5) * 0.05,
          wy + (rng() - 0.5) * 0.05,
          0.018 + rng() * 0.026,
          rng() * TAU,
          blob(rng, 14, 0.5),
          BED_COLORS.weed,
        ),
      );
  }
}

export function generateBed(seed = 7): BedShape[] {
  const rng = randomSeed(seed);
  const list: BedShape[] = [];
  sandBed(rng, list);
  underwater(rng, list);
  cluster(rng, list, 0.07, 0.08, 0.16, true);
  cluster(rng, list, 0.05, 0.5, 0.12, false);
  cluster(rng, list, 0.1, 0.88, 0.18, true);
  cluster(rng, list, 0.92, 0.1, 0.15, true);
  cluster(rng, list, 0.96, 0.45, 0.11, false);
  cluster(rng, list, 0.9, 0.88, 0.16, true);
  list.sort((a, b) => a.z - b.z || a.y - b.y);
  return list;
}
