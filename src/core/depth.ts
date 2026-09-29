import { clamp } from "./math.ts";
import type { DepthField } from "./types.ts";

export const DEEP_TINT: readonly [number, number, number] = [0.7, 0.86, 0.99];

export function sampleDepth(field: DepthField, u: number, v: number): number {
  const { w, h, data } = field;
  const x = clamp(u * w - 0.5, 0, w - 1);
  const y = clamp(v * h - 0.5, 0, h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = data[y0 * w + x0]!;
  const b = data[y0 * w + x1]!;
  const c = data[y1 * w + x0]!;
  const d = data[y1 * w + x1]!;
  return a + (b - a) * fx + (c + (d - c) * fx - (a + (b - a) * fx)) * fy;
}
