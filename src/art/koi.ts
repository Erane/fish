import { BODY, fishPalette, randomSeed } from "../core/index.ts";
import type { FishKind, FishMark } from "../core/types.ts";
import { FISH_SHADE } from "../style.ts";

const TAU = Math.PI * 2;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export type Noise2 = (x: number, y: number) => number;

export function valueNoise(seed: number): Noise2 {
  const r = randomSeed(seed * 7919 + 17);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = r();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = perm[i]!;
    perm[i] = perm[j]!;
    perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i]!;
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const X = xi & 255;
    const Y = yi & 255;
    const a = vals[perm[perm[X]! + Y]!]!;
    const b = vals[perm[perm[X + 1]! + Y]!]!;
    const c = vals[perm[perm[X]! + Y + 1]!]!;
    const d = vals[perm[perm[X + 1]! + Y + 1]!]!;
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(n: Noise2, x: number, y: number, oct = 4): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let t = 0;
  for (let i = 0; i < oct; i++) {
    s += a * n(x * f + i * 17.3, y * f - i * 9.1);
    t += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / t;
}

export const girthOf = (seed: number): number => 0.93 + randomSeed(seed + 3)() * 0.14;

export function halfWidth(x: number, girth: number, kind: FishKind): number {
  const silver = kind === "silvercarp";
  const len = silver ? 70 : 64;
  const t = (BODY.nose - x) / len;
  if (t < 0 || t > 1) return 0;
  const peak = silver ? 0.32 : 0.42;
  const W = (silver ? 7.2 : 9.4) * girth;
  const end = t > 0.92 ? Math.sqrt(Math.max(0, 1 - ((t - 0.92) / 0.08) ** 2)) : 1;
  if (t < peak) {
    const s = t / peak;
    return W * Math.pow(1 - (1 - s) * (1 - s), 0.55) * end;
  }
  return (
    W * (1 - (silver ? 0.74 : 0.62) * Math.pow((t - peak) / (1 - peak), silver ? 1.25 : 1.5)) * end
  );
}

const LEVELS = FISH_SHADE.shadeLevels;
const LAST = LEVELS.length - 1;
const bandOf = (v: number): number =>
  Math.min(LAST, Math.max(0, Math.floor(Math.abs(v) * LEVELS.length)));
const qvOf = (v: number): number => bandOf(v) / (LAST || 1);

function sheenAt(t: number): number {
  const s = FISH_SHADE.sheen.stops;
  for (let i = 1; i < s.length; i++)
    if (t <= s[i]![0] || i === s.length - 1)
      return mix(s[i - 1]![1], s[i]![1], clamp01((t - s[i - 1]![0]) / (s[i]![0] - s[i - 1]![0])));
  return 0;
}

const OUT = (FISH_SHADE.outline.match(/[\d.]+/g) ?? []).map(Number);
const line = (a: number): string => `rgba(${OUT[0]},${OUT[1]},${OUT[2]},${(OUT[3] ?? 1) * a})`;

type Pattern = (x: number, y: number, w: number, out: number[]) => void;

function patternFor(kind: FishKind, seed: number): Pattern {
  const r = randomSeed(seed + 11);
  const n = valueNoise(seed);
  const n2 = valueNoise(seed + 101);
  const ox = r() * 50;
  const oy = r() * 50;
  const th = 0.5 + (r() - 0.5) * 0.12 + (kind === "sanke" ? 0.03 : 0);
  const headRed = r() < 0.75;
  const band = r() * TAU;
  const split = r() < 0.5 ? -1 : 1;
  const tx = 23.5 + r() * 1.5;
  const tr = 5.6 + r() * 1.1;
  return (x, y, w, out) => {
    const v = Math.max(-1, Math.min(1, y / Math.max(w, 0.5)));
    out[0] = -1;
    out[1] = -1;
    if (kind === "kohaku" || kind === "sanke") {
      let val = fbm(n, x * 0.075 + ox, v * 1.05 + oy) + 0.14 * Math.sin(x * 0.16 + band);
      if (headRed) val += 0.2 * smooth(17, 25, x);
      out[0] = val - th - 0.6 * smooth(30.5, 33.5, x) - 0.08 * smooth(0.7, 1, Math.abs(v));
      if (kind === "sanke")
        out[1] = fbm(n2, x * 0.2 + ox, v * 1.8 + oy, 3) - 0.72 - 0.3 * smooth(13, 19, x);
    } else if (kind === "utsuri") {
      const val =
        fbm(n, x * 0.06 + ox, v * 0.9 + oy) +
        0.12 * Math.sin(x * 0.13 + band) +
        0.35 * smooth(17, 21, x) * smooth(-0.15, 0.15, split * v + (x - 26) * 0.12);
      out[1] = val - th - 0.04;
    } else if (kind === "tancho")
      out[0] = (tr - Math.hypot(x - tx, y) - (n(x * 0.5 + ox, y * 0.5 + oy) - 0.5) * 1.4) * 0.06;
  };
}

interface Layers {
  W: number;
  H: number;
  ppu: number;
  girth: number;
  albedo: ImageData;
  shade: Float32Array;
  spec: Float32Array;
  fin: ImageData;
  kind: FishKind;
}

const layerCache = new Map<string, Layers>();

function fishLayers(palette: number, seed: number, ppu: number, species?: "silvercarp"): Layers {
  const key = `${species ?? "koi"}:${palette}:${seed}:${ppu}`;
  const hit = layerCache.get(key);
  if (hit) return hit;
  const pal = fishPalette({ palette, species });
  const kind = pal.kind;
  const girth = girthOf(seed);
  const pattern = patternFor(kind, seed);
  const grain = valueNoise(seed + 7);
  const W = Math.round(BODY.width * ppu);
  const H = Math.round(BODY.half * 2 * ppu);
  const N = W * H;
  const albedo = new ImageData(W, H);
  const shade = new Float32Array(N);
  const spec = new Float32Array(N);
  const fin = new ImageData(W, H);
  const base = hex(pal.base);
  const hiC = hex(pal.spot);
  const sumiC = hex(pal.second ?? pal.spot);
  const finC = hex(pal.fin);
  const metal = kind === "ogon";
  const dark = kind === "karasu";
  const silver = kind === "silvercarp";
  const red = kind === "benigoi";
  const patterned = kind === "kohaku" || kind === "sanke" || kind === "utsuri" || kind === "tancho";
  const P = [0, 0];
  const ped = [0, 0];
  pattern(-26, 0, 3, ped);
  const wobble = (x: number, y: number): number => (grain(x * 1.6, y * 1.6) - 0.5) * 0.008;
  for (let py = 0; py < H; py++) {
    const y = (py + 0.5) / ppu - BODY.half;
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / ppu + BODY.left;
      const i = py * W + px;
      const j = i * 4;
      const w = halfWidth(x, girth, kind);
      const ay = Math.abs(y);
      if (w > 0) {
        const cov = clamp01((w - ay) * ppu + 0.5);
        if (cov > 0) {
          const v = Math.max(-1, Math.min(1, y / w));
          const qv = qvOf(v);
          let c0: number;
          let c1: number;
          let c2: number;
          if (metal) {
            const k = 1 - qv;
            c0 = mix(166, 228, k);
            c1 = mix(104, 172, k);
            c2 = mix(22, 52, k);
            const head = smooth(18, 28, x) * k;
            c0 = mix(c0, 234, head * 0.3);
            c1 = mix(c1, 184, head * 0.3);
            c2 = mix(c2, 84, head * 0.3);
          } else if (silver) {
            const flank = smooth(0.22, 0.72, qv);
            const belly = smooth(0.6, 0.88, qv);
            const head = smooth(10, 22, x) * (1 - flank) * 0.25;
            c0 = mix(mix(34 - head * 12, 200, flank), 244, belly);
            c1 = mix(mix(72 - head * 20, 212, flank), 247, belly);
            c2 = mix(mix(70 - head * 18, 210, flank), 241, belly);
          } else {
            c0 = base[0];
            c1 = base[1];
            c2 = base[2];
            if (dark) {
              const side = [0, 0.18, 0.5][bandOf(v)]!;
              c0 = mix(c0, 92, side);
              c1 = mix(c1, 104, side);
              c2 = mix(c2, 100, side);
            } else if (red) {
              const flank = smooth(0.15, 0.95, qv);
              const head = smooth(16, 24, x);
              c0 = mix(mix(176, 222, flank), 214, head * 0.5);
              c1 = mix(mix(34, 70, flank), 66, head * 0.5);
              c2 = mix(mix(26, 42, flank), 44, head * 0.5);
            } else {
              const flank = smooth(0.7, 1, qv) * 0.3 + smooth(29, 33, x) * 0.3;
              c0 = mix(c0, 236, flank);
              c1 = mix(c1, 214, flank);
              c2 = mix(c2, 202, flank);
            }
          }
          if (patterned) {
            pattern(x, y, w, P);
            const w0 = wobble(x, y);
            const w1 = wobble(x + 5, y - 3);
            const hi = smooth(w0 - 0.002, w0 + 0.002, P[0]!);
            const sumi = smooth(w1 - 0.002, w1 + 0.002, P[1]!);
            c0 = mix(c0, hiC[0], hi);
            c1 = mix(c1, hiC[1], hi);
            c2 = mix(c2, hiC[2], hi);
            c0 = mix(c0, sumiC[0], sumi);
            c1 = mix(c1, sumiC[1], sumi);
            c2 = mix(c2, sumiC[2], sumi);
          }
          const along = smooth(-23, -17, x) * smooth(10, 5, x);
          const e0 = dark ? 0.12 : 0.3;
          const spine = along * (1 - smooth(e0, e0 + 0.2, ay)) * (dark ? 0.16 : 0.42);
          c0 *= 1 - spine;
          c1 *= 1 - spine;
          c2 *= 1 - spine;
          albedo.data[j] = c0;
          albedo.data[j + 1] = c1;
          albedo.data[j + 2] = c2;
          albedo.data[j + 3] = cov * 255;
          shade[i] = LEVELS[bandOf(v)]!;
          spec[i] = FISH_SHADE.sheen.alpha * sheenAt(qv);
        }
      }
      const tailRoot = silver ? -32 : -23;
      if (x < tailRoot && x > -57.5) {
        const tailU = clamp01(((silver ? -34 : -26) - x) / (silver ? 22 : 26));
        const span = (silver ? 1.7 : 3.2) + (silver ? 8 : 9.4) * Math.pow(tailU, 0.85);
        const wob = (grain(x * 0.5, y * 0.5) - 0.5) * (silver ? 0.45 : 1.2);
        const endX =
          (silver ? -43 : -47) -
          (silver ? 13 : 9) * Math.pow(Math.min(1, ay / (silver ? 9.3 : 11.5)), 1.6) +
          wob;
        const edge = Math.min(span - ay, x - endX, tailRoot - x);
        if (edge > -0.6) {
          const th = Math.atan2(y, -(x - tailRoot + 1));
          const ray = Math.pow(0.5 + 0.5 * Math.cos(th * (silver ? 11 : 15)), 12);
          const a =
            clamp01((edge + 0.6) / 1.4) * mix(0.8, 0.34, silver ? tailU : clamp01((-27 - x) / 26));
          const base2 = clamp01(1 - ((silver ? -34 : -26) - x) / 7);
          const pedHi = ped[0]! > 0 ? 1 : 0;
          const pedSumi = ped[1]! > 0;
          let f0 = finC[0];
          let f1 = finC[1];
          let f2 = finC[2];
          f0 = mix(f0, mix(base[0], hiC[0], pedHi), base2 * 0.8);
          f1 = mix(f1, mix(base[1], hiC[1], pedHi), base2 * 0.8);
          f2 = mix(f2, mix(base[2], hiC[2], pedHi), base2 * 0.8);
          if (pedSumi) {
            f0 = mix(f0, sumiC[0], base2 * 0.7);
            f1 = mix(f1, sumiC[1], base2 * 0.7);
            f2 = mix(f2, sumiC[2], base2 * 0.7);
          }
          const inkK = ray * (1 - base2) * 0.22;
          fin.data[j] = mix(f0, OUT[0]!, inkK);
          fin.data[j + 1] = mix(f1, OUT[1]!, inkK);
          fin.data[j + 2] = mix(f2, OUT[2]!, inkK);
          fin.data[j + 3] = clamp01(a) * 255;
        }
      }
    }
  }
  const layers: Layers = { W, H, ppu, girth, albedo, shade, spec, fin, kind };
  if (layerCache.size > 90) layerCache.delete(layerCache.keys().next().value!);
  layerCache.set(key, layers);
  return layers;
}

export interface KoiSpriteSeed {
  palette: number;
  seed: number;
  species?: "silvercarp";
  marks?: FishMark[];
}

export function fishSprite(
  f: KoiSpriteSeed,
  ppu = 3.5,
  out?: HTMLCanvasElement,
): HTMLCanvasElement {
  const L = fishLayers(f.palette, f.seed, ppu, f.species);
  const { W, H } = L;
  const c = out && out.width === W && out.height === H ? out : canvas(W, H);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, W, H);
  let alb = L.albedo.data;
  if (f.marks && f.marks.length) {
    ctx.putImageData(L.albedo, 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    for (const m of f.marks) {
      ctx.beginPath();
      ctx.arc((m.x - BODY.left) * ppu, (m.y + BODY.half) * ppu, m.r * ppu, 0, TAU);
      ctx.fillStyle = m.color;
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    alb = ctx.getImageData(0, 0, W, H).data;
  }
  const out2 = ctx.createImageData(W, H);
  const o = out2.data;
  const fin = L.fin.data;
  for (let i = 0, j = 0; i < W * H; i++, j += 4) {
    const ba = alb[j + 3]! / 255;
    const fa = fin[j + 3]! / 255;
    const a = ba + fa * (1 - ba);
    if (a <= 0) continue;
    const sh = L.shade[i]!;
    const sp = L.spec[i]! * 255;
    const k = fa * (1 - ba);
    o[j] = (Math.min(255, alb[j]! * sh + sp) * ba + fin[j]! * k) / a;
    o[j + 1] = (Math.min(255, alb[j + 1]! * sh + sp) * ba + fin[j + 1]! * k) / a;
    o[j + 2] = (Math.min(255, alb[j + 2]! * sh + sp * 0.96) * ba + fin[j + 2]! * k) / a;
    o[j + 3] = a * 255;
  }
  ctx.putImageData(out2, 0, 0);
  ctx.save();
  ctx.scale(ppu, ppu);
  ctx.translate(-BODY.left, BODY.half);
  const dark = L.kind === "karasu";
  const ink = (a: number): string => (dark ? `rgba(200,210,205,${(OUT[3] ?? 1) * a})` : line(a));
  ctx.globalCompositeOperation = "source-atop";
  const hg = ctx.createRadialGradient(27, 0, 0, 27, 0, 7);
  hg.addColorStop(0, "rgba(255,255,250,.16)");
  hg.addColorStop(1, "rgba(255,255,250,0)");
  ctx.fillStyle = hg;
  ctx.fillRect(18, -9, 18, 18);
  ctx.lineCap = "round";
  for (const s of [-1, 1]) {
    const w1 = halfWidth(18.6, L.girth, L.kind);
    const w2 = halfWidth(16.2, L.girth, L.kind);
    ctx.beginPath();
    ctx.moveTo(18.8, s * w1 * 0.42);
    ctx.quadraticCurveTo(18.2, s * w1 * 0.85, 16.2, s * w2 * 0.99);
    ctx.strokeStyle = ink(0.3);
    ctx.lineWidth = 0.55;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(30.6, s * 2.1, 0.55, 0.4, 0, 0, TAU);
    ctx.fillStyle = ink(0.6);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  for (const s of [-1, 1]) {
    if (L.kind !== "silvercarp") {
      ctx.beginPath();
      ctx.moveTo(32.6, s * 1.9);
      ctx.quadraticCurveTo(34, s * 2.3, 34.7, s * 3.5);
      ctx.strokeStyle = dark ? "rgba(60,70,66,.55)" : "rgba(214,196,168,.55)";
      ctx.lineWidth = 0.38;
      ctx.stroke();
    }
    const ex = L.kind === "silvercarp" ? 23.8 : 25.8;
    const ey = s * (halfWidth(ex, L.girth, L.kind) - 1.25);
    const ring = ctx.createRadialGradient(ex, ey, 0.15, ex, ey, 1.45);
    ring.addColorStop(0, "#0f1413");
    ring.addColorStop(0.5, "#1a201e");
    ring.addColorStop(0.62, L.kind === "ogon" ? "#d9bf78" : dark ? "#6d7262" : "#b8aa7e");
    ring.addColorStop(0.85, "rgba(120,110,90,.35)");
    ring.addColorStop(1, "rgba(120,110,90,0)");
    ctx.beginPath();
    ctx.arc(ex, ey, 1.45, 0, TAU);
    ctx.fillStyle = ring;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 0.3, ey - 0.22, 0.26, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.fill();
  }
  const len = L.kind === "silvercarp" ? 70 : 64;
  const pts: [number, number][] = [];
  for (let x = BODY.nose + 0.5; x >= BODY.nose - len - 0.5; x -= 0.2) {
    const hw = halfWidth(x, L.girth, L.kind);
    if (hw > 0) pts.push([x, hw]);
  }
  if (pts.length) {
    const outline = new Path2D();
    outline.moveTo(pts[0]![0], pts[0]![1]);
    for (const [x, hw] of pts) outline.lineTo(x, hw);
    for (let i = pts.length - 1; i >= 0; i--) outline.lineTo(pts[i]![0], -pts[i]![1]);
    outline.closePath();
    ctx.globalCompositeOperation = "source-atop";
    ctx.strokeStyle = ink(1);
    ctx.lineWidth = FISH_SHADE.outlineWidth;
    ctx.lineJoin = "round";
    ctx.stroke(outline);
  }
  ctx.restore();
  return c;
}
