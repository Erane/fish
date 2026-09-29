import type { BedShape } from "../render/bedShapes.ts";

export interface CrabHome {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface ObstacleAnchor {
  x: number;
  y: number;
  r: number;
}

const BIG_LEAF = 0.06;
const BIG_FLOWER = 0.03;
const SPOT = 0.03;

function rank(s: BedShape): number {
  if (s.kind === "rock") return 0;
  if (s.kind === "leaf" || s.kind === "penny") return 1;
  if (s.kind === "bud") return 3;
  if (s.kind === "flower") return s.size > BIG_FLOWER ? 4 : 2;
  return 4;
}

export function floatShapes(shapes: BedShape[]): BedShape[] {
  return shapes.filter((s) => s.above > 0).sort((a, b) => rank(a) - rank(b) || b.size - a.size);
}

export function isBigLeaf(s: BedShape): boolean {
  return s.kind === "leaf" && s.size > BIG_LEAF;
}

export function spotAnchors(shapes: BedShape[]): [number, number][] {
  return shapes
    .filter((s) => (s.kind === "leaf" || s.kind === "flower") && s.size > SPOT)
    .map((s) => [s.x, s.y]);
}

export function budAnchors(shapes: BedShape[]): [number, number][] {
  const buds = shapes.filter((s) => s.kind === "bud");
  const list = buds.length ? buds : shapes.filter((s) => s.kind === "flower");
  return list.map((s) => [
    s.x - Math.sin(s.rot) * s.size * 0.7,
    s.y - Math.cos(s.rot) * s.size * 0.7,
  ]);
}

export function crabHomes(shapes: BedShape[]): CrabHome[] {
  return shapes
    .filter((s) => s.kind === "rock" && s.above > 0)
    .map((s) => ({ x: s.x, y: s.y, rx: s.size, ry: s.size * 0.8 }));
}

export function obstacleAnchors(shapes: BedShape[]): ObstacleAnchor[] {
  return shapes
    .filter((s) => (s.kind === "rock" && s.above > 0) || isBigLeaf(s))
    .map((s) => ({ x: s.x, y: s.y, r: s.size * (s.kind === "rock" ? 0.95 : 0.55) }));
}
