import { sampleDepth } from "../core/index.ts";
import type { DepthField } from "../core/index.ts";

export interface BedTransform {
  u: [number, number, number];
  v: [number, number, number];
  turn: number;
}

export function fitBed(W: number, H: number, w: number, h: number, allowTurn = true): BedTransform {
  const turn = allowTurn && h > w * 1.15 ? 1 : 0;
  const ia = turn ? H / W : W / H;
  const sa = w / h;
  const r = sa > ia ? [0, (1 - ia / sa) / 2, 1, ia / sa] : [(1 - sa / ia) / 2, 0, sa / ia, 1];
  return turn
    ? { u: [0, r[3], r[1]], v: [-r[2], 0, 1 - r[0]], turn }
    : { u: [r[2], 0, r[0]], v: [0, r[3], r[1]], turn };
}

export function bedToScreen(
  bed: BedTransform,
  iu: number,
  iv: number,
  w: number,
  h: number,
): [number, number] {
  const [a, b, c] = bed.u;
  const [d, e, f] = bed.v;
  const det = a * e - b * d;
  const x = iu - c;
  const y = iv - f;
  return [((e * x - b * y) / det) * w, ((a * y - d * x) / det) * h];
}

export function depthAtScreen(
  depth: DepthField | null,
  bed: BedTransform,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  if (!depth) return 0;
  const a = x / w;
  const b = y / h;
  return sampleDepth(
    depth,
    bed.u[0] * a + bed.u[1] * b + bed.u[2],
    bed.v[0] * a + bed.v[1] * b + bed.v[2],
  );
}
