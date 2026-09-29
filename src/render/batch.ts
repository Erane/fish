import { BODY } from "../core/index.ts";
import type { SpriteDef, SpriteSet, Vec4 } from "./types.ts";

export const ATLAS = 2048;
export const FISH_PPU = 3.5;
export const CELL_W = Math.round(BODY.width * FISH_PPU);
export const CELL_H = Math.round(BODY.half * 2 * FISH_PPU);
export const CELL_COLS = 6;
export const CELL_PITCH_X = 340;
export const CELL_PITCH_Y = CELL_H + 4;
export const MISC_Y = CELL_PITCH_Y * 11 + 8;
export const MAX_FISH = 66;
export const SEG_UNITS = BODY.length / BODY.segments;

export const cellOrigin = (i: number): [number, number] => [
  (i % CELL_COLS) * CELL_PITCH_X + 2,
  Math.floor(i / CELL_COLS) * CELL_PITCH_Y + 2,
];

export const STRIDE = 16;
export const WHITE: Vec4 = [1, 1, 1, 1];

export class Batch {
  f = new Float32Array(STRIDE * 4096);
  ix = new Uint32Array(6 * 4096);
  nv = 0;
  ni = 0;

  reset(): void {
    this.nv = 0;
    this.ni = 0;
  }

  ensure(v: number, i: number): void {
    if ((this.nv + v) * STRIDE > this.f.length) {
      const n = new Float32Array(Math.max(this.f.length * 2, (this.nv + v) * STRIDE));
      n.set(this.f);
      this.f = n;
    }
    if (this.ni + i > this.ix.length) {
      const n = new Uint32Array(Math.max(this.ix.length * 2, this.ni + i));
      n.set(this.ix);
      this.ix = n;
    }
  }

  vert(
    x: number,
    y: number,
    u: number,
    v: number,
    c: Vec4,
    fog?: Vec4,
    side = 0,
    width = 0,
    metal = 0,
    gloss = 0,
  ): number {
    const f = this.f;
    const o = this.nv * STRIDE;
    f[o] = x;
    f[o + 1] = y;
    f[o + 2] = u;
    f[o + 3] = v;
    f[o + 4] = c[0];
    f[o + 5] = c[1];
    f[o + 6] = c[2];
    f[o + 7] = c[3];
    f[o + 8] = fog ? fog[0] : 0;
    f[o + 9] = fog ? fog[1] : 0;
    f[o + 10] = fog ? fog[2] : 0;
    f[o + 11] = fog ? fog[3] : 0;
    f[o + 12] = side;
    f[o + 13] = width;
    f[o + 14] = metal;
    f[o + 15] = gloss;
    return this.nv++;
  }
}

export function packSprites(sprites: SpriteSet): SpriteSet {
  const list = Object.entries(sprites).sort((a, b) => b[1].canvas.height - a[1].canvas.height);
  let x = 4;
  let y = MISC_Y;
  let shelf = 0;
  for (const [, s] of list) {
    const w = s.canvas.width;
    const h = s.canvas.height;
    if (x + w + 4 > ATLAS) {
      x = 4;
      y += shelf + 8;
      shelf = 0;
    }
    if (y + h + 4 > ATLAS) throw new Error("atlas full");
    s.x = x;
    s.y = y;
    s.w = w;
    s.h = h;
    x += w + 8;
    shelf = Math.max(shelf, h);
    s.u0 = s.x / ATLAS;
    s.v0 = s.y / ATLAS;
    s.u1 = (s.x + w) / ATLAS;
    s.v1 = (s.y + h) / ATLAS;
  }
  return sprites;
}

export function spriteCorners(
  def: SpriteDef,
  x: number,
  y: number,
  angle: number,
  sx: number,
  sy: number,
): [number, number][] {
  const w = (def.w / def.ppu) * sx;
  const h = (def.h / def.ppu) * sy;
  const ox = -def.px * w;
  const oy = -def.py * h;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const pts: [number, number][] = [
    [ox, oy],
    [ox + w, oy],
    [ox + w, oy + h],
    [ox, oy + h],
  ];
  return pts.map(([a, b]) => [x + a * c - b * s, y + a * s + b * c]);
}
