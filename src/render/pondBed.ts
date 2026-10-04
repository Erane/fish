import type { DepthField } from "../core/types.ts";
import type { PondPack, SeasonAsset } from "../core/pack.ts";
import { depthFromPolygon } from "../core/depth.ts";
import { generateBed } from "./bedShapes.ts";
import type { BedShape } from "./bedShapes.ts";
import { bedDepth, floatMask, paintBed } from "./bedPaint.ts";
import { anchorsFromShapes } from "../scene/anchors.ts";
import type { BedAnchors } from "../scene/anchors.ts";

export interface PondBed {
  texture: HTMLCanvasElement;
  mask: HTMLCanvasElement | null;
  water: HTMLCanvasElement | null;
  depth: DepthField | null;
  anchors: BedAnchors;
  decor: BedShape[];
  boundary: number[] | null;
  tint: string | null;
  bedW: number;
  bedH: number;
}

function waterMask(polygon: number[], size = 256): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.filter = "blur(2px)";
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  for (let i = 0; i < polygon.length; i += 2) {
    const x = polygon[i]! * size;
    const y = polygon[i + 1]! * size;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  return c;
}

export function builtinBed(seed: number, bedW: number, bedH: number): PondBed {
  const shapes = generateBed(seed);
  return {
    texture: paintBed(shapes, bedW, bedH, 1),
    mask: floatMask(shapes, bedW, bedH),
    water: null,
    depth: bedDepth(shapes, bedW, bedH, seed),
    anchors: anchorsFromShapes(shapes),
    decor: shapes,
    boundary: null,
    tint: null,
    bedW,
    bedH,
  };
}

export function packBed(
  pack: PondPack,
  asset: SeasonAsset,
  image: HTMLImageElement | ImageBitmap,
): PondBed {
  const iw = "naturalWidth" in image ? image.naturalWidth : image.width;
  const ih = "naturalHeight" in image ? image.naturalHeight : image.height;
  const bedW = Math.max(2, iw);
  const bedH = Math.max(2, ih);
  const texture = document.createElement("canvas");
  texture.width = bedW;
  texture.height = bedH;
  texture.getContext("2d")!.drawImage(image as CanvasImageSource, 0, 0, bedW, bedH);
  const dw = 128;
  const dh = Math.max(1, Math.round((dw * bedH) / bedW));
  const a = pack.water.anchors;
  return {
    texture,
    mask: null,
    water: pack.water.polygon.length >= 6 ? waterMask(pack.water.polygon) : null,
    depth: depthFromPolygon(pack.water.polygon, dw, dh),
    anchors: {
      spots: a.spots.map(([x, y]) => [x, y] as [number, number]),
      buds: a.buds.map(([x, y]) => [x, y] as [number, number]),
      homes: a.crabHomes.map((c) => ({ x: c.x, y: c.y, rx: c.rx, ry: c.ry })),
      obstacles: pack.water.obstacles.map((o) => ({ x: o.x, y: o.y, r: o.r })),
    },
    decor: [],
    boundary: pack.water.polygon.slice(),
    tint: asset.tint.water,
    bedW,
    bedH,
  };
}
