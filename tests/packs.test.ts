import { describe, expect, it } from "vite-plus/test";
import { planSeasonAssets, seasonAssetId } from "../src/data/packs.ts";
import type { PondPack, Season } from "../src/core/pack.ts";

function basePack(over: Partial<PondPack> = {}): PondPack {
  return {
    format: 1,
    id: "user-pond-1",
    name: "Test Pond",
    style: "cel",
    water: {
      polygon: [0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8],
      obstacles: [],
      anchors: { crabHomes: [], spots: [], buds: [] },
    },
    seasons: {
      spring: { image: "spring.png", tint: { water: "#9dc0ab" } },
      summer: { image: "summer.png", tint: { water: "#7fa88c" } },
    },
    ...over,
  };
}

function files(seasons: Season[]): Partial<Record<Season, Blob>> {
  return Object.fromEntries(seasons.map((s) => [s, new Blob()]));
}

describe("seasonAssetId", () => {
  it("is deterministic per pack and season", () => {
    expect(seasonAssetId("user-pond-1", "summer")).toBe("asset-user-pond-1-summer");
    expect(seasonAssetId("user-pond-1", "summer")).toBe(seasonAssetId("user-pond-1", "summer"));
  });

  it("differs across packs and seasons", () => {
    expect(seasonAssetId("a", "summer")).not.toBe(seasonAssetId("b", "summer"));
    expect(seasonAssetId("a", "summer")).not.toBe(seasonAssetId("a", "winter"));
  });
});

describe("planSeasonAssets", () => {
  it("新包：选图的季节进 overwrite，未选图的季节不出现", () => {
    const plan = planSeasonAssets(undefined, basePack(), files(["spring"]));
    expect(plan).toEqual({ overwrite: ["spring"], keep: [], remove: [] });
  });

  it("更新：选图的季节覆盖，未选图的季节保留存量", () => {
    const plan = planSeasonAssets(basePack(), basePack(), files(["summer"]));
    expect(plan.overwrite).toEqual(["summer"]);
    expect(plan.keep).toEqual(["spring"]);
    expect(plan.remove).toEqual([]);
  });

  it("更新：JSON 移除的季节，其存量资产被清理，仍保留的季节继续留着", () => {
    const fewer = basePack();
    delete fewer.seasons.spring;
    const plan = planSeasonAssets(basePack(), fewer, {});
    expect(plan.overwrite).toEqual([]);
    expect(plan.keep).toEqual(["summer"]);
    expect(plan.remove).toEqual(["spring"]);
  });

  it("更新：JSON 换成全新季节且无图时，旧资产全部清理且无可保留项", () => {
    const other = basePack({
      seasons: { winter: { image: "w.png", tint: { water: "#aabbcc" } } },
    });
    const plan = planSeasonAssets(basePack(), other, {});
    expect(plan.overwrite).toEqual([]);
    expect(plan.keep).toEqual([]);
    expect(plan.remove).toEqual(["spring", "summer"]);
  });

  it("不改动传入的包对象", () => {
    const existing = basePack();
    const next = basePack();
    const existingSnapshot = structuredClone(existing);
    const nextSnapshot = structuredClone(next);
    planSeasonAssets(existing, next, files(["spring"]));
    expect(existing).toEqual(existingSnapshot);
    expect(next).toEqual(nextSnapshot);
  });
});
