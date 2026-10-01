import { pushInside, signedDistToPoly } from "./boundary.ts";
import { clamp } from "./math.ts";
import type { Obstacle } from "./types.ts";

export class Field {
  private readonly poly: number[] | null;
  private readonly w: number;
  private readonly h: number;
  private readonly obstacles: readonly Obstacle[];

  constructor(poly: number[] | null, w: number, h: number, obstacles: readonly Obstacle[]) {
    this.poly = poly;
    this.w = w;
    this.h = h;
    this.obstacles = obstacles;
  }

  clearance(x: number, y: number): number {
    let d = this.poly ? signedDistToPoly(x, y, this.poly) : Math.min(x, y, this.w - x, this.h - y);
    for (const o of this.obstacles) {
      const c = Math.hypot(x - o.x, y - o.y) - o.r;
      if (c < d) d = c;
    }
    return d;
  }

  inside(x: number, y: number, reach: number): [number, number] {
    const margin = reach * SHORE;
    if (this.poly) [x, y] = pushInside(x, y, this.poly, margin);
    else {
      x = clamp(x, margin, this.w - margin);
      y = clamp(y, margin, this.h - margin);
    }
    for (const o of this.obstacles) {
      const dx = x - o.x;
      const dy = y - o.y;
      const d = Math.hypot(dx, dy);
      const room = o.r + margin;
      if (d < room) {
        x = o.x + (d > 1e-6 ? (dx / d) * room : room);
        y = o.y + (d > 1e-6 ? (dy / d) * room : 0);
      }
    }
    return [x, y];
  }
}

export interface Heading {
  x: number;
  y: number;
  block: number;
}

export const SHORE = 0.55;

const PROBE = [0.5, 1.1];
const ROOM = 0.15;
const SOFT = 0.4;
const STEP = Math.PI / 12;
const SIDES = 12;
const GAIN = 3.4;
const DRIFT = 1.5;
const HAND = 0.9;

export const handed = (seed: number): number => (seed % 2 ? 1 : -1);

export function scanHeading(
  field: Field,
  x: number,
  y: number,
  angle: number,
  reach: number,
  hand: number,
): Heading {
  const margin = reach * SHORE;
  const room = reach * ROOM;
  const band = reach * SOFT;
  const dir = (a: number): [number, number] => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    let q = Infinity;
    for (const r of PROBE) {
      const v = field.clearance(x + c * reach * r, y + s * reach * r);
      if (v < q) q = v;
    }
    return [q, clamp((q - room) / band, -1, 1)];
  };
  const ahead = dir(angle)[0];
  const block = clamp((margin - ahead) / margin, 0, 1);
  if (block === 0) return { x: Math.cos(angle), y: Math.sin(angle), block: 0 };
  let vx = 0;
  let vy = 0;
  for (let i = -SIDES; i <= SIDES; i++) {
    const off = i * STEP;
    const a = angle + off;
    const w = Math.exp(GAIN * dir(a)[1] - DRIFT * Math.abs(off) + HAND * Math.sign(off) * hand);
    vx += Math.cos(a) * w;
    vy += Math.sin(a) * w;
  }
  const l = Math.hypot(vx, vy);
  if (!(l > 1e-6)) return { x: Math.cos(angle), y: Math.sin(angle), block };
  return { x: vx / l, y: vy / l, block };
}
