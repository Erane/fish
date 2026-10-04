import type { Quality } from "../core/types.ts";

export interface QualitySpec {
  dprCap: number | null;
  pixelCap: number;
  auxDiv: number;
  simCell: number;
  frameHz: number;
}

export const QUALITY_SPEC: Record<Quality, QualitySpec> = {
  ultra: { dprCap: null, pixelCap: Number.POSITIVE_INFINITY, auxDiv: 3, simCell: 3, frameHz: 60 },
  high: { dprCap: 2, pixelCap: 3840 * 2160, auxDiv: 2, simCell: 3, frameHz: 60 },
  eco: { dprCap: 1, pixelCap: 1.6e6, auxDiv: 3, simCell: 4, frameHz: 30 },
};

export function tierDpr(quality: Quality, deviceDpr: number): number {
  const cap = QUALITY_SPEC[quality].dprCap;
  return Math.max(1, cap ? Math.min(deviceDpr, cap) : deviceDpr);
}

export interface RenderSizes {
  cw: number;
  ch: number;
  shadow: [number, number];
  caustic: [number, number];
  surface: [number, number];
  cloud: [number, number];
  sim: [number, number];
}

export function renderSizes(w: number, h: number, dpr: number, quality: Quality): RenderSizes {
  const spec = QUALITY_SPEC[quality];
  const px = w * h * dpr * dpr;
  const k = px > spec.pixelCap ? Math.sqrt(spec.pixelCap / px) : 1;
  const cw = Math.max(1, Math.floor(w * dpr * k));
  const ch = Math.max(1, Math.floor(h * dpr * k));
  const ax = Math.ceil(cw / spec.auxDiv);
  const ay = Math.ceil(ch / spec.auxDiv);
  return {
    cw,
    ch,
    shadow: [ax, ay],
    caustic: [ax, ay],
    surface: [ax, ay],
    cloud: [Math.ceil(cw / 8), Math.ceil(ch / 8)],
    sim: [Math.min(900, Math.ceil(cw / spec.simCell)), Math.min(900, Math.ceil(ch / spec.simCell))],
  };
}
