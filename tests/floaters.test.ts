import { describe, expect, it } from "vite-plus/test";
import type { BedShape } from "../src/render/bedShapes.ts";
import type { Look, Renderer, SpriteDef } from "../src/render/types.ts";
import { Floaters } from "../src/scene/floaters.ts";
import type { FloaterEnv } from "../src/scene/floaters.ts";

const fakeDef: SpriteDef = {
  canvas: {} as HTMLCanvasElement,
  w: 1,
  h: 1,
  ppu: 1,
  px: 0,
  py: 0,
  x: 0,
  y: 0,
  u0: 0,
  v0: 0,
  u1: 1,
  v1: 1,
};

function shape(kind: BedShape["kind"], x: number, y: number, size: number, above = 1): BedShape {
  return { kind, x, y, size, rot: 0, poly: [], fill: "#000", z: 0, above, shadow: 0, wet: 0 };
}

interface FloaterCall {
  angle: number;
  push: number;
  seed: number;
}

function stubR(calls: FloaterCall[]): Renderer {
  return {
    sprites: new Proxy({} as Record<string, SpriteDef>, { get: () => fakeDef }),
    imageToScreen: (x: number, y: number) => [x, y] as [number, number],
    floater: (
      _ix: number,
      _iy: number,
      _irx: number,
      _iry: number,
      _rot: number,
      angle: number,
      _dx: number,
      _dy: number,
      push: number,
      _snowK?: number,
      _wetKind?: number,
      _pool?: number,
      seed?: number,
    ) => {
      calls.push({ angle, push, seed: seed ?? 0 });
    },
    sprite: () => {},
  } as unknown as Renderer;
}

const look = {
  wave: 0.5,
  bright: 1,
  tint: [1, 1, 1],
  shadowDir: [0.7, 0.72],
} as unknown as Look;

const env = (over: Partial<FloaterEnv> = {}): FloaterEnv => ({
  weather: "sunny",
  rainK: 0,
  calm: false,
  scale: 1,
  w: 1600,
  h: 900,
  time: 0,
  ...over,
});

describe("Floaters", () => {
  it("draws every above-water shape and keeps rocks static", () => {
    const calls: FloaterCall[] = [];
    const R = stubR(calls);
    const f = new Floaters(
      R,
      [shape("rock", 0.2, 0.2, 0.09), shape("leaf", 0.5, 0.5, 0.08)],
      1600,
      900,
      () => {},
      () => 0.5,
    );
    f.layout(1600, 900);
    f.draw(env(), look);
    expect(calls.length).toBe(2);
    expect(calls[0]!.push).toBe(0);
    expect(calls[1]!.push).toBeGreaterThan(0);
  });

  it("drums rain onto leaves and splashes where it lands", () => {
    const calls: FloaterCall[] = [];
    const R = stubR(calls);
    let splashes = 0;
    let leafSplashes = 0;
    const f = new Floaters(
      R,
      [shape("leaf", 0.5, 0.5, 0.08), shape("flower", 0.6, 0.4, 0.04)],
      1600,
      900,
      (_x, _y, _s, leaf) => {
        splashes++;
        if (leaf) leafSplashes++;
      },
    );
    f.layout(1600, 900);
    for (let i = 0; i < 400; i++)
      f.update(0.05, env({ weather: "rain", rainK: 1, time: i * 0.05 }));
    expect(splashes).toBeGreaterThan(0);
    expect(leafSplashes).toBe(splashes);
  });

  it("does not drum when the weather is calm", () => {
    const calls: FloaterCall[] = [];
    const R = stubR(calls);
    let splashes = 0;
    const f = new Floaters(
      R,
      [shape("leaf", 0.5, 0.5, 0.08)],
      1600,
      900,
      () => splashes++,
      () => 0.5,
    );
    f.layout(1600, 900);
    for (let i = 0; i < 200; i++) f.update(0.05, env({ weather: "sunny", time: i * 0.05 }));
    expect(splashes).toBe(0);
  });
});
