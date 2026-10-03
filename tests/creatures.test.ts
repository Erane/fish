import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_SETTINGS } from "../src/core/index.ts";
import type { Settings } from "../src/core/types.ts";
import type { BedShape } from "../src/render/bedShapes.ts";
import type { Look, Renderer, SpriteDef } from "../src/render/types.ts";
import { Creatures } from "../src/scene/creatures.ts";
import { anchorsFromShapes } from "../src/scene/anchors.ts";

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

function stubR(counts: Record<string, number>): Renderer {
  return {
    sprites: new Proxy({} as Record<string, SpriteDef>, { get: () => fakeDef }),
    imageToScreen: (x: number, y: number) => [x, y] as [number, number],
    sprite: (layer: string) => {
      counts[layer] = (counts[layer] ?? 0) + 1;
    },
    floater: () => {},
  } as unknown as Renderer;
}

const look = {
  wave: 0.5,
  bright: 1,
  tint: [1, 1, 1],
  shadow: 0.5,
  water: [0.3, 0.4, 0.4],
  shadowDir: [0.7, 0.72],
} as unknown as Look;

const settings = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over });

const ROCK = [shape("rock", 0.5, 0.5, 0.09), shape("leaf", 0.3, 0.6, 0.08)];
const ROCK_ANCHORS = anchorsFromShapes(ROCK);

describe("Creatures", () => {
  it("derives sim obstacles from rocks and big leaves", () => {
    const c = new Creatures(
      stubR({}),
      ROCK_ANCHORS,
      1600,
      900,
      () => {},
      () => 0.5,
    );
    const obstacles = c.layout(1600, 900, 1);
    expect(obstacles.length).toBe(2);
    expect(obstacles[0]!.x).toBe(800);
    expect(obstacles[0]!.r).toBeGreaterThan(0);
  });

  it("乌龟按当前游速位置成为软障碍，并随设置开关", () => {
    const c = new Creatures(
      stubR({}),
      ROCK_ANCHORS,
      1600,
      900,
      () => {},
      () => 0.5,
    );
    c.layout(1600, 900, 1);
    for (let i = 0; i < 30; i++)
      c.update(0.05, settings({ turtles: true, crabs: false, butterflies: false }), i * 0.05);
    const obstacles = c.obstacles();
    expect(obstacles.length).toBe(4);
    const turtles = obstacles.slice(2);
    for (const t of turtles) {
      expect(t.r).toBeGreaterThan(0);
      expect(Number.isFinite(t.x)).toBe(true);
      expect(Number.isFinite(t.y)).toBe(true);
    }
    c.update(0.05, settings({ turtles: false, crabs: false, butterflies: false }), 2);
    expect(c.obstacles().length).toBe(2);
  });

  it("lights fireflies in the air at night", () => {
    const counts: Record<string, number> = {};
    const c = new Creatures(
      stubR(counts),
      ROCK_ANCHORS,
      1600,
      900,
      () => {},
      () => 0.5,
    );
    c.layout(1600, 900, 1);
    c.update(
      0.05,
      settings({ turtles: false, crabs: false, butterflies: true, night: true, weather: "sunny" }),
      0,
    );
    c.drawAir(look);
    expect(counts.glow).toBeGreaterThan(0);
    expect(counts.air ?? 0).toBe(0);
  });

  it("flies butterflies and dragonflies on a sunny day", () => {
    const counts: Record<string, number> = {};
    const c = new Creatures(
      stubR(counts),
      ROCK_ANCHORS,
      1600,
      900,
      () => {},
      () => 0.5,
    );
    c.layout(1600, 900, 1);
    for (let i = 0; i < 20; i++)
      c.update(
        0.05,
        settings({
          turtles: false,
          crabs: false,
          butterflies: true,
          night: false,
          weather: "sunny",
        }),
        i * 0.05,
      );
    c.drawAir(look);
    expect(counts.air).toBeGreaterThan(0);
    expect(counts.glow ?? 0).toBe(0);
  });

  it("draws no creatures when every toggle is off", () => {
    const counts: Record<string, number> = {};
    const c = new Creatures(
      stubR(counts),
      ROCK_ANCHORS,
      1600,
      900,
      () => {},
      () => 0.5,
    );
    c.layout(1600, 900, 1);
    c.update(
      0.05,
      settings({
        turtles: false,
        crabs: false,
        butterflies: false,
        night: false,
        weather: "sunny",
      }),
      0,
    );
    c.drawAir(look);
    c.drawSurface(look);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("lets a crab emerge onto its rock, then hides it when startled", () => {
    const counts: Record<string, number> = {};
    const c = new Creatures(
      stubR(counts),
      ROCK_ANCHORS,
      1600,
      900,
      () => {},
      () => 0.5,
    );
    c.layout(1600, 900, 1);
    const s = settings({
      turtles: false,
      crabs: true,
      butterflies: false,
      night: false,
      weather: "sunny",
    });
    for (let i = 0; i < 200; i++) c.update(0.05, s, i * 0.05);
    c.drawSurface(look);
    expect(counts.surface).toBeGreaterThan(0);
    c.startle(800, 450);
    for (let i = 0; i < 400; i++) c.update(0.05, s, 10 + i * 0.05);
    const before = counts.surface;
    c.drawSurface(look);
    expect(counts.surface).toBe(before);
  });
});
