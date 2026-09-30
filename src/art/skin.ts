import { BODY } from "../core/index.ts";
import type { SkinSpecies } from "../core/skins.ts";
import { CELL_H, CELL_W } from "../render/batch.ts";

export interface FishSkin {
  canvas: HTMLCanvasElement;
  widths: Float32Array;
}

const ALPHA = 8;

export function alphaBox(
  data: ArrayLike<number>,
  w: number,
  h: number,
): [number, number, number, number] {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3]! > ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  return maxX < 0 ? [0, 0, w - 1, h - 1] : [minX, minY, maxX, maxY];
}

export function widthsFromAlpha(data: ArrayLike<number>, w: number, h: number): Float32Array {
  const half = (h - 1) / 2;
  const out = new Float32Array(BODY.segments + 1);
  for (let i = 0; i <= BODY.segments; i++) {
    const x = BODY.nose - (i * BODY.length) / BODY.segments;
    const px = Math.max(0, Math.min(w - 1, Math.round(((x - BODY.left) / BODY.width) * (w - 1))));
    let ext = 0;
    for (let y = 0; y < h; y++)
      if (data[(y * w + px) * 4 + 3]! > ALPHA) {
        const d = Math.abs(y - half) / half;
        if (d > ext) ext = d;
      }
    out[i] = ext;
  }
  return out;
}

function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  return canvas
    .getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, canvas.width, canvas.height).data;
}

export function normalizeSkin(image: HTMLImageElement | ImageBitmap): HTMLCanvasElement {
  const iw = "naturalWidth" in image ? image.naturalWidth : image.width;
  const ih = "naturalHeight" in image ? image.naturalHeight : image.height;
  const src = document.createElement("canvas");
  src.width = iw;
  src.height = ih;
  src.getContext("2d", { willReadFrequently: true })!.drawImage(image, 0, 0);
  const [minX, minY, maxX, maxY] = alphaBox(pixels(src), iw, ih);
  const c = document.createElement("canvas");
  c.width = CELL_W;
  c.height = CELL_H;
  c.getContext("2d")!.drawImage(
    src,
    minX,
    minY,
    maxX - minX + 1,
    maxY - minY + 1,
    0,
    0,
    CELL_W,
    CELL_H,
  );
  return c;
}

export function skinWidths(canvas: HTMLCanvasElement): Float32Array {
  return widthsFromAlpha(pixels(canvas), canvas.width, canvas.height);
}

export function fishSkin(image: HTMLImageElement | ImageBitmap): FishSkin {
  const canvas = normalizeSkin(image);
  return { canvas, widths: skinWidths(canvas) };
}

export function buildPackSkins(
  images: Partial<Record<SkinSpecies, HTMLImageElement>>,
): Partial<Record<SkinSpecies, FishSkin>> {
  const out: Partial<Record<SkinSpecies, FishSkin>> = {};
  for (const [species, img] of Object.entries(images) as [SkinSpecies, HTMLImageElement][])
    out[species] = fishSkin(img);
  return out;
}
