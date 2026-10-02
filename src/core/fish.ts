import { clamp, TAU, wrap } from "./math.ts";
import { PALETTES } from "./palette.ts";
import type { Fish, StoredFish, Temper } from "./types.ts";

export const BODY = {
  nose: 34,
  tail: -58,
  length: 92,
  segments: 16,
  rigid: 5,
  left: -60,
  width: 96,
  half: 14,
} as const;

const FISH_NAMES = [
  "锦时",
  "小满",
  "丹朱",
  "听雨",
  "白露",
  "金盏",
  "青禾",
  "望舒",
  "知秋",
  "浮玉",
  "映月",
  "点绛",
  "云游",
  "春水",
  "琥珀",
  "松墨",
  "桃夭",
  "长安",
  "涟漪",
  "拾光",
  "朝露",
  "小暑",
  "如意",
  "团团",
];

type FishSeed = StoredFish & {
  species?: "silvercarp";
  x: number;
  y: number;
  angle: number;
  phase: number;
  speed: number;
};

function makeFish(seed: FishSeed, random: () => number): Fish {
  const f: Fish = {
    ...seed,
    v: 0,
    turn: 0,
    thrust: 0,
    amp: 0.25,
    beating: false,
    depth: 0.5,
    depthGoal: 0.5,
    goal: null,
    goalTime: 0,
    target: null,
    rest: 0,
    checkT: 2 + random() * 2,
    checkX: 0,
    checkY: 0,
    flee: 0,
    fleeAngle: 0,
    cruise: 0.4,
    react: 0.5,
    appetite: 0.8,
    temper: temperOf(seed.seed),
    spine: null,
    spineSeg: 0,
  };
  f.depth =
    f.species === "silvercarp"
      ? 0.23 + random() * 0.2
      : clamp(f.temper.depthBand + (random() - 0.5) * 0.5, 0.15, 0.85);
  f.depthGoal = f.depth;
  f.checkX = f.x;
  f.checkY = f.y;
  f.cruise = (0.3 + random() * 0.22) * clamp(f.speed || 1, 0.5, 1.5);
  f.react = 0.15 + random() * 0.9;
  f.appetite = 0.55 + random() * 0.45;
  return f;
}

export function createFish(index: number, random: () => number = Math.random): Fish {
  return makeFish(
    {
      id: `koi-${Date.now()}-${index}`,
      name: FISH_NAMES[index % FISH_NAMES.length]!,
      palette: index % PALETTES.length,
      size: 0.62 + random() * 0.4,
      seed: Math.floor(random() * 100000),
      eaten: 0,
      marks: [],
      x: 0.17 + random() * 0.66,
      y: 0.18 + random() * 0.62,
      angle: random() * TAU,
      phase: random() * 10,
      speed: 0.85 + random() * 0.3,
    },
    random,
  );
}

export function createSilverCarpShoal(random: () => number = Math.random): Fish[] {
  return Array.from({ length: 4 }, (_, i) =>
    makeFish(
      {
        id: `silvercarp-${i}`,
        name: `青鲢${i + 1}`,
        palette: 0,
        size: 0.88 + random() * 0.24,
        seed: Math.floor(random() * 100000),
        eaten: 0,
        marks: [],
        species: "silvercarp",
        x: 0.36 + i * 0.075,
        y: 0.43 + random() * 0.12,
        angle: -0.25,
        phase: random() * 10,
        speed: 1.12,
      },
      random,
    ),
  );
}

export function revive(stored: StoredFish, random: () => number = Math.random): Fish {
  return makeFish(
    {
      ...stored,
      x: 0.17 + random() * 0.66,
      y: 0.18 + random() * 0.62,
      angle: random() * TAU,
      phase: random() * 10,
      speed: 0.85 + random() * 0.3,
    },
    random,
  );
}

export function temperOf(seed: number): Temper {
  let h = seed | 0;
  const next = (): number => {
    h = (h * 1664525 + 1013904223) | 0;
    return ((h >>> 8) & 0xffff) / 0x10000;
  };
  return {
    restRate: 0.5 + next() * 1.3,
    wanderAmp: 0.7 + next() * 0.7,
    turnKeen: 0.8 + next() * 0.5,
    depthBand: 0.35 + next() * 0.3,
    scullRate: 0.6 + next() * 0.9,
  };
}

export function updateSpine(f: Fish, s: number, w: number, h: number): void {
  const rigid = f.species === "silvercarp" ? 4 : BODY.rigid;
  const n = BODY.segments;
  const seg = (BODY.length / n) * s;
  const x = f.x * w;
  const y = f.y * h;
  const c = Math.cos(f.angle);
  const si = Math.sin(f.angle);
  const nx = x + c * BODY.nose * s;
  const ny = y + si * BODY.nose * s;
  let p = f.spine;
  if (!p || Math.abs(f.spineSeg - seg) > seg * 0.3 || Math.hypot(p[0] - nx, p[1] - ny) > seg * 3) {
    p = new Float32Array((n + 1) * 2);
    f.spine = p;
    for (let i = 0; i <= n; i++) {
      p[i * 2] = nx - c * seg * i;
      p[i * 2 + 1] = ny - si * seg * i;
    }
  }
  f.spineSeg = seg;
  for (let i = 0; i <= rigid; i++) {
    p[i * 2] = nx - c * seg * i;
    p[i * 2 + 1] = ny - si * seg * i;
  }
  let prev = f.angle;
  for (let i = rigid + 1; i <= n; i++) {
    const px = p[(i - 1) * 2];
    const py = p[(i - 1) * 2 + 1];
    const lim = f.species === "silvercarp" ? 0.13 + (0.22 * i) / n : 0.1 + (0.16 * i) / n;
    const a = prev + clamp(wrap(Math.atan2(py - p[i * 2 + 1], px - p[i * 2]) - prev), -lim, lim);
    p[i * 2] = px - Math.cos(a) * seg;
    p[i * 2 + 1] = py - Math.sin(a) * seg;
    prev = a;
  }
}

export function fishPose(
  f: Fish,
  s: number,
  out: Float32Array = new Float32Array((BODY.segments + 1) * 4),
): Float32Array {
  const silver = f.species === "silvercarp";
  const n = BODY.segments;
  const p = f.spine!;
  const amp = (f.amp || 0) * (silver ? 4.8 : 6.4) * s;
  for (let i = 0; i <= n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n, i + 1);
    let tx = p[a * 2] - p[b * 2];
    let ty = p[a * 2 + 1] - p[b * 2 + 1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const u = i / n;
    const env = 0.05 + 0.95 * Math.pow(Math.max(0, (u - 0.2) / 0.8), 1.5);
    const lat = amp * env * Math.sin(f.phase - u * (silver ? 6.4 : 5.4));
    out[i * 4] = p[i * 2] - ty * lat;
    out[i * 4 + 1] = p[i * 2 + 1] + tx * lat;
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n, i + 1);
    const tx = out[a * 4] - out[b * 4];
    const ty = out[a * 4 + 1] - out[b * 4 + 1];
    const l = Math.hypot(tx, ty) || 1;
    out[i * 4 + 2] = -ty / l;
    out[i * 4 + 3] = tx / l;
  }
  return out;
}

const SEP_WIDTHS = [
  0.55, 0.8, 0.95, 1, 1, 0.98, 0.94, 0.9, 0.85, 0.8, 0.74, 0.66, 0.58, 0.5, 0.42, 0.3, 0.18,
] as const;

export function spineGap(
  a: Fish,
  b: Fish,
  sa: number,
  sb: number,
): { gap: number; px: number; py: number } | null {
  const pa = a.spine;
  const pb = b.spine;
  if (!pa || !pb) return null;
  let gap = Infinity;
  let px = 0;
  let py = 0;
  for (let i = 0; i <= BODY.segments; i++) {
    const ax = pa[i * 2]!;
    const ay = pa[i * 2 + 1]!;
    const ra = SEP_WIDTHS[i]! * BODY.half * sa;
    for (let j = 0; j <= BODY.segments; j++) {
      const dx = ax - pb[j * 2]!;
      const dy = ay - pb[j * 2 + 1]!;
      if (Math.abs(dx) + Math.abs(dy) - ra - SEP_WIDTHS[j]! * BODY.half * sb >= gap) continue;
      const dist = Math.hypot(dx, dy) || 1e-4;
      const g = dist - ra - SEP_WIDTHS[j]! * BODY.half * sb;
      if (g < gap) {
        gap = g;
        px = dx / dist;
        py = dy / dist;
      }
    }
  }
  return { gap, px, py };
}
