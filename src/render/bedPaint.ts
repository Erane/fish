import { clamp } from "../core/index.ts";
import type { DepthField } from "../core/index.ts";
import type { BedShape } from "./bedShapes.ts";
import { valueNoise } from "./textures.ts";

function tracePath(ctx: CanvasRenderingContext2D, poly: number[]): void {
  ctx.beginPath();
  ctx.moveTo(poly[0]!, poly[1]!);
  for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i]!, poly[i + 1]!);
  ctx.closePath();
}

// Flat-fill, hard-edged: the cel look comes from solid colour blocks, never gradients or feathering.
export function paintBed(shapes: BedShape[], w: number, h: number, dpr = 1): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const m = Math.min(w, h);
  for (const s of shapes) {
    ctx.fillStyle = s.fill;
    if (s.kind === "sand") {
      ctx.fillRect(0, 0, w, h);
      continue;
    }
    ctx.save();
    ctx.translate(s.x * w, s.y * h);
    ctx.rotate(s.rot);
    ctx.scale(s.size * m, s.size * m);
    tracePath(ctx, s.poly);
    ctx.fill();
    ctx.restore();
  }
  return c;
}

// Red = above the water (no refraction or caustics), green = casts a shadow on the bed, blue = leaves a wet line.
export function floatMask(shapes: BedShape[], w: number, h: number): HTMLCanvasElement {
  const k = 0.5;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext("2d")!;
  const m = Math.min(w, h) * k;
  for (const s of shapes) {
    if (s.above <= 0) continue;
    ctx.fillStyle = `rgb(${Math.round(s.above * 255)},${Math.round(s.shadow * 255)},${Math.round(s.wet * 255)})`;
    ctx.save();
    ctx.translate(s.x * w * k, s.y * h * k);
    ctx.rotate(s.rot);
    ctx.scale(s.size * m, s.size * m);
    tracePath(ctx, s.poly);
    ctx.fill();
    ctx.restore();
  }
  return c;
}

function boxBlurField(d: Float32Array, w: number, h: number, r: number): Float32Array {
  const k = r * 2 + 1;
  const at = (a: number, b: number) => (a < 0 || b < 0 || a >= w || b >= h ? 0 : d[b * w + a]!);
  const t = new Float32Array(d.length);
  const o = new Float32Array(d.length);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += at(x, y);
    for (let x = 0; x < w; x++) {
      t[y * w + x] = acc / k;
      acc += at(x + r + 1, y) - at(x - r, y);
    }
  }
  const atT = (a: number, b: number) => (a < 0 || b < 0 || a >= w || b >= h ? 0 : t[b * w + a]!);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += atT(x, y);
    for (let y = 0; y < h; y++) {
      o[y * w + x] = acc / k;
      acc += atT(x, y + r + 1) - atT(x, y - r);
    }
  }
  return o;
}

// The pond deepens from its banks toward the open middle. Where the lotus, pennywort and rocks root marks the
// banks, so those shapes shoal that side of an elliptical basin; low-frequency noise keeps the deep organic.
export function bedDepth(shapes: BedShape[], w: number, h: number, seed = 7): DepthField {
  const gw = 176;
  const gh = Math.max(2, Math.round((gw * h) / w));
  const n = valueNoise(seed);
  const smooth = (v: number) => {
    const t = clamp(v, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const m = Math.min(w, h);
  const anchors = shapes
    .filter((s) => s.above > 0)
    .map((s) => ({ x: s.x * w, y: s.y * h, r: s.size * m * 1.9 + 46 }));
  let d: Float32Array = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const ix = ((i + 0.5) / gw) * w;
      const iy = ((j + 0.5) / gh) * h;
      let shoal = 0;
      for (const a of anchors) {
        const dx = ix - a.x;
        if (dx > a.r || dx < -a.r) continue;
        const dy = iy - a.y;
        if (dy > a.r || dy < -a.r) continue;
        const q = (dx * dx + dy * dy) / (a.r * a.r);
        if (q < 2.4) {
          const v = Math.exp(-q * 0.9);
          if (v > shoal) shoal = v;
        }
      }
      const basin = smooth(1 - Math.hypot((ix / w - 0.5) * 2, (iy / h - 0.5) * 2));
      const warp =
        0.62 + 0.56 * (n(ix / 560, iy / 560) * 0.55 + n(ix / 200 + 4.7, iy / 200 - 2.3) * 0.45);
      d[j * gw + i] = clamp(basin * (1 - shoal * 0.96) * warp, 0, 1);
    }
  const r = Math.max(1, Math.round(gw / 16));
  d = boxBlurField(boxBlurField(d, gw, gh, r), gw, gh, r);
  let peak = 0;
  for (const v of d) peak = Math.max(peak, v);
  for (let i = 0; i < d.length; i++) d[i] = Math.pow(d[i] / peak, 0.6);
  return { data: d, w: gw, h: gh };
}
