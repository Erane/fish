import { describe, it, expect } from "vite-plus/test";
import { createFish, DEFAULT_SETTINGS, PondSimulation, randomSeed } from "../src/core/index.ts";
import type { Settings } from "../src/core/types.ts";
import { dayKey, Persister } from "../src/data/persist.ts";

function makePersister(): Persister {
  const random = randomSeed(3);
  const sim = new PondSimulation([createFish(0, random)], 800, 600, random);
  return new Persister(sim, { ...DEFAULT_SETTINGS } as Settings);
}

describe("dayKey", () => {
  it("采用本地时区的 ISO 日期", () => {
    expect(dayKey(new Date(2026, 8, 30))).toBe("2026-09-30");
  });
});

describe("Persister", () => {
  it("snapshot 只保留可存档字段，且与活体状态解耦", () => {
    const p = makePersister();
    p.daily = { date: "2026-09-30", count: 4 };
    const snap = p.snapshot();
    expect(snap.daily).toEqual({ date: "2026-09-30", count: 4 });
    expect(Object.keys(snap.fish[0]!).sort()).toEqual(
      ["eaten", "id", "marks", "name", "palette", "seed", "size"].sort(),
    );
    p.daily.count = 9;
    expect(snap.daily!.count).toBe(4);
  });

  it("bumpFeed 累加当日投喂次数", () => {
    const p = makePersister();
    p.bumpFeed();
    p.bumpFeed();
    expect(p.daily.date).toBe(dayKey());
    expect(p.daily.count).toBe(2);
  });

  it("跨天后 bumpFeed 归零重新计数", () => {
    const p = makePersister();
    p.daily = { date: "2020-01-01", count: 7 };
    p.bumpFeed();
    expect(p.daily).toEqual({ date: dayKey(), count: 1 });
  });
});
