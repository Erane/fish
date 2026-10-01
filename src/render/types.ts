import type { Quality } from "../core/types.ts";

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

export interface Look {
  sunK: number;
  bright: number;
  sat: number;
  tint: Vec3;
  caustic: number;
  causticTint: Vec3;
  causticFloor: number;
  glint: number;
  glintColor: Vec3;
  sky: Vec3;
  skyK: number;
  cloudCover: number;
  cloudShade: number;
  wave: number;
  refract: number;
  ripple: number;
  rippleDamp: number;
  shade: number;
  shadow: number;
  vignette: number;
  water: Vec3;
  moon: number;
  moonFloor: number;
  mist: number;
  depth: number;
  posterize: number;
  posterMix: number;
  paperMix: number;
  paperLift: number;
  grain: number;
  sun: Vec3;
  moonDisc: Vec4;
  causticCell: number;
  cloudWind: Vec2;
  shadowDir: Vec2;
  snowCover: number;
  wetCover: number;
  rainK: number;
  flash: number;
}

export type Layer = "shadow" | "under" | "floaters" | "surface" | "airShadow" | "air" | "glow";

export const LAYERS: readonly Layer[] = [
  "shadow",
  "under",
  "floaters",
  "surface",
  "airShadow",
  "air",
  "glow",
];

export interface SpriteDef {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  ppu: number;
  px: number;
  py: number;
  x: number;
  y: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export type SpriteSet = Record<string, SpriteDef>;

export interface BodyLight {
  species?: "silvercarp";
  seed: number;
  palette: number;
  widths: Float32Array;
  metal: number;
  gloss: number;
}

export interface Renderer {
  readonly kind: "webgl2";
  readonly ripples: boolean;
  readonly sprites: SpriteSet;
  readonly canvas: HTMLCanvasElement;
  resize(w: number, h: number, dpr: number, quality: Quality): void;
  imageToScreen(x: number, y: number): [number, number];
  setFish(i: number, sprite: HTMLCanvasElement): void;
  render(time: number, dt: number, env: Look): void;
  depthAt(x: number, y: number): number;
  drop(x: number, y: number, r: number, s: number): void;
  floater(
    ix: number,
    iy: number,
    irx: number,
    iry: number,
    rot: number,
    angle: number,
    dx: number,
    dy: number,
    push: number,
    snowK?: number,
    wetKind?: number,
    pool?: number,
    seed?: number,
  ): void;
  sprite(
    layer: Layer,
    def: SpriteDef,
    x: number,
    y: number,
    angle: number,
    sx: number,
    sy: number,
    color?: Vec4,
    fog?: Vec4,
  ): void;
  fish(
    layer: Layer,
    cell: number,
    pose: Float32Array,
    s: number,
    cx: number,
    cy: number,
    k: number,
    color?: Vec4,
    fog?: Vec4,
    dx?: number,
    dy?: number,
    light?: BodyLight,
  ): void;
}
