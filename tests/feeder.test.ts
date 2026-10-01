import { describe, expect, it } from "vite-plus/test";

import { Feeder } from "../src/ui/feeder.ts";
import type { FeedOutcome } from "../src/ui/feeder.ts";
import type { Interaction } from "../src/core/types.ts";

interface Harness {
  feeder: Feeder;
  drops: { x: number; y: number }[];
  startles: number;
  scares: { x: number; y: number }[];
  taps: number;
  plops: number;
  bumps: number;
}

function makeFeeder(
  mode: Interaction,
  feedResult: boolean,
  foodCount = 0,
  boundary: number[] | null = null,
): Harness {
  const h: Harness = {
    feeder: undefined as unknown as Feeder,
    drops: [],
    startles: 0,
    scares: [],
    taps: 0,
    plops: 0,
    bumps: 0,
  };
  const scene = {
    scale: 2,
    startle: () => h.startles++,
    drop: (x: number, y: number) => h.drops.push({ x, y }),
  };
  const food: { x: number; y: number }[] = [];
  const sim = {
    food,
    boundary,
    feed: (x: number, y: number) => {
      if (!feedResult) return false;
      for (let i = 0; i < foodCount; i++) food.push({ x, y });
      return true;
    },
    scare: (x: number, y: number) => h.scares.push({ x, y }),
  };
  const audio = {
    tap: () => h.taps++,
    plop: () => h.plops++,
  };
  const persister = { bumpFeed: () => h.bumps++ };
  h.feeder = new Feeder(sim as never, scene as never, audio as never, persister as never, mode);
  return h;
}

describe("Feeder", () => {
  it("喂鱼模式：落食、计数并投喂", () => {
    const h = makeFeeder("feed", true, 2);
    const outcome: FeedOutcome = h.feeder.feedAt(10, 20);
    expect(outcome).toBe("fed");
    expect(h.startles).toBe(1);
    expect(h.drops).toHaveLength(3);
    expect(h.bumps).toBe(1);
    expect(h.plops).toBe(1);
  });

  it("鱼食未吃完时返回 busy 且不计数", () => {
    const h = makeFeeder("feed", false);
    const outcome = h.feeder.feedAt(10, 20);
    expect(outcome).toBe("busy");
    expect(h.drops).toHaveLength(1);
    expect(h.bumps).toBe(0);
    expect(h.plops).toBe(0);
  });

  it("惊扰模式：惊鱼不落食", () => {
    const h = makeFeeder("startle", true);
    const outcome = h.feeder.feedAt(10, 20);
    expect(outcome).toBe("startled");
    expect(h.scares).toEqual([{ x: 10, y: 20 }]);
    expect(h.taps).toBe(1);
    expect(h.drops).toHaveLength(1);
    expect(h.bumps).toBe(0);
  });

  it("池塘外点击：无任何反应", () => {
    const h = makeFeeder("feed", true, 2, [0, 0, 100, 0, 100, 100, 0, 100]);
    const outcome = h.feeder.feedAt(200, 200);
    expect(outcome).toBe("ignored");
    expect(h.startles).toBe(0);
    expect(h.drops).toHaveLength(0);
    expect(h.scares).toHaveLength(0);
    expect(h.taps).toBe(0);
    expect(h.plops).toBe(0);
    expect(h.bumps).toBe(0);
  });

  it("有边界时池塘内点击仍正常", () => {
    const h = makeFeeder("startle", true, 0, [0, 0, 100, 0, 100, 100, 0, 100]);
    const outcome = h.feeder.feedAt(10, 20);
    expect(outcome).toBe("startled");
    expect(h.scares).toEqual([{ x: 10, y: 20 }]);
  });

  it("观鱼模式：点击无任何水面反应", () => {
    const h = makeFeeder("watch", true, 2);
    const outcome = h.feeder.feedAt(10, 20);
    expect(outcome).toBe("ignored");
    expect(h.startles).toBe(0);
    expect(h.drops).toHaveLength(0);
    expect(h.scares).toHaveLength(0);
    expect(h.taps).toBe(0);
    expect(h.plops).toBe(0);
    expect(h.bumps).toBe(0);
  });
});
