import { describe, expect, it } from "vite-plus/test";
import { bindAssets, seasonAssetId } from "../src/data/packs.ts";
import type { PondPack } from "../src/core/pack.ts";

function basePack(over: Partial<PondPack> = {}): PondPack {
  return {
    format: 1,
    id: "user-pond-1",
    name: "Test Pond",
    style: "cel",
    water: {
      polygon: [0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8],
      depth: { w: 2, h: 2, data: [0, 0.5, 0.5, 1] },
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

describe("bindAssets", () => {
  it("rewrites image ids for the seasons provided", () => {
    const out = bindAssets(basePack(), { summer: "asset-x" });
    expect(out.seasons.summer!.image).toBe("asset-x");
  });

  it("leaves seasons without a binding untouched", () => {
    const out = bindAssets(basePack(), { summer: "asset-x" });
    expect(out.seasons.spring!.image).toBe("spring.png");
  });

  it("does not mutate the source pack", () => {
    const src = basePack();
    bindAssets(src, { summer: "asset-x", spring: "asset-y" });
    expect(src.seasons.summer!.image).toBe("summer.png");
    expect(src.seasons.spring!.image).toBe("spring.png");
  });

  it("ignores bindings for seasons the pack does not have", () => {
    const out = bindAssets(basePack(), { winter: "asset-w" });
    expect(out.seasons.winter).toBeUndefined();
    expect(out.seasons.summer!.image).toBe("summer.png");
  });

  it("preserves tint and the rest of the asset", () => {
    const out = bindAssets(basePack(), { summer: "asset-x" });
    expect(out.seasons.summer!.tint.water).toBe("#7fa88c");
    expect(out.id).toBe("user-pond-1");
  });
});
