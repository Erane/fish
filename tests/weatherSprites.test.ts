import { describe, expect, it } from "vite-plus/test";
import type { BedShape } from "../src/render/bedShapes.ts";
import type { Renderer, SpriteDef, Vec4 } from "../src/render/types.ts";
import type { PondBed } from "../src/render/pondBed.ts";
import type { Weather } from "../src/core/types.ts";
import { DEFAULT_SETTINGS } from "../src/core/index.ts";
import { anchorsFromShapes } from "../src/scene/anchors.ts";
import { PondScene } from "../src/scene/scene.ts";
import type { SimView } from "../src/scene/scene.ts";

type TaggedDef = SpriteDef & { key: string };

const fakeDef = (key: string): TaggedDef =>
  ({ key, canvas: {} as HTMLCanvasElement }) as unknown as TaggedDef;

interface Call {
  kind: string;
  color: Vec4;
}

function stubR(calls: Call[]): Renderer {
  return {
    sprites: new Proxy({} as Record<string, TaggedDef>, {
      get: (_t, key: string) => fakeDef(key),
    }),
    imageToScreen: (x: number, y: number) => [x, y] as [number, number],
    resize: () => {},
    setFish: () => {},
    render: () => {},
    depthAt: () => 0.5,
    drop: () => {},
    floater: () => {},
    fish: () => {},
    sprite: (
      layer: string,
      def: TaggedDef,
      _x: number,
      _y: number,
      _a: number,
      _sx: number,
      _sy: number,
      color?: Vec4,
    ) => {
      if (color && (layer === "air" || layer === "surface")) calls.push({ kind: def.key, color });
    },
  } as unknown as Renderer;
}

const sim: SimView = { allFish: [], food: [], scale: 1, obstacles: [] };
const bed = {
  texture: {} as HTMLCanvasElement,
  mask: null,
  water: null,
  depth: null,
  anchors: anchorsFromShapes([]),
  decor: [] as BedShape[],
  boundary: null,
  tint: null,
  bedW: 100,
  bedH: 100,
} as unknown as PondBed;

function weatherCalls(weather: Weather, amount: number): Call[] {
  const calls: Call[] = [];
  const g = globalThis as Record<string, unknown>;
  const saved = g.matchMedia;
  g.matchMedia = () => ({ matches: false });
  try {
    const scene = new PondScene(stubR(calls), sim, bed);
    const settings = { ...DEFAULT_SETTINGS, weather, rainAmount: amount, snowAmount: amount };
    scene.layout(900, 560);
    scene.setLook(weather, false, 0, amount, amount, 1);
    for (let i = 0; i < 40; i++) {
      scene.update(0.05, settings);
      calls.length = 0;
      scene.draw(settings);
    }
  } finally {
    g.matchMedia = saved;
  }
  return calls;
}

function kindsFadingInAlpha(calls: Call[]): Map<string, Set<string>> {
  const rgb = new Map<string, Set<string>>();
  const alpha = new Map<string, Set<number>>();
  for (const c of calls) {
    const key = c.color
      .slice(0, 3)
      .map((v) => v.toFixed(3))
      .join(",");
    (rgb.get(c.kind) ?? rgb.set(c.kind, new Set()).get(c.kind)!).add(key);
    (alpha.get(c.kind) ?? alpha.set(c.kind, new Set()).get(c.kind)!).add(+c.color[3].toFixed(3));
  }
  const out = new Map<string, Set<string>>();
  for (const [kind, set] of alpha) if (set.size > 1) out.set(kind, rgb.get(kind) ?? new Set());
  return out;
}

describe("weather sprite colors", () => {
  it("carries the rain fade in alpha, never baked into rgb", () => {
    const fading = kindsFadingInAlpha(weatherCalls("rain", 1));
    expect(fading.size).toBeGreaterThan(0);
    for (const [kind, rgbs] of fading) expect(rgbs.size, kind).toBe(1);
  });

  it("carries the snow fade in alpha, never baked into rgb", () => {
    const fading = kindsFadingInAlpha(weatherCalls("snow", 1));
    expect(fading.size).toBeGreaterThan(0);
    for (const [kind, rgbs] of fading) expect(rgbs.size, kind).toBe(1);
  });

  it("keeps rain streaks bright in rgb and faint in alpha", () => {
    const streaks = weatherCalls("rain", 1).filter((c) => c.kind === "streak");
    expect(streaks.length).toBeGreaterThan(0);
    for (const c of streaks) {
      expect(Math.max(...c.color.slice(0, 3))).toBeGreaterThanOrEqual(0.9);
      expect(c.color[3]).toBeLessThan(0.6);
    }
  });
});
