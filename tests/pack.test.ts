import { describe, expect, it } from "vite-plus/test";
import { parsePack, seasonForDate, pickSeason } from "../src/core/pack.ts";
import type { PondPack } from "../src/core/pack.ts";

function basePack(over: Partial<PondPack> = {}): PondPack {
  return {
    format: 1,
    id: "p1",
    name: "Test Pond",
    style: "cel",
    water: {
      polygon: [0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8],
      obstacles: [{ x: 0.5, y: 0.5, r: 0.05 }],
      anchors: { crabHomes: [], spots: [], buds: [] },
    },
    seasons: { summer: { image: "asset-1", tint: { water: "#9dc0ab" } } },
    ...over,
  };
}

describe("parsePack", () => {
  it("accepts a valid pack", () => {
    expect(parsePack(basePack())).not.toBeNull();
  });

  it("rejects a bad format version", () => {
    expect(parsePack({ ...basePack(), format: 2 } as unknown)).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(parsePack(null)).toBeNull();
    expect(parsePack("x")).toBeNull();
  });

  it("requires at least one season with an image", () => {
    expect(parsePack({ ...basePack(), seasons: {} })).toBeNull();
  });

  it("rejects a polygon with too few points", () => {
    const p = basePack();
    p.water.polygon = [0.2, 0.2, 0.8, 0.8];
    expect(parsePack(p)).toBeNull();
  });

  it("rejects a polygon with an odd coordinate count", () => {
    const p = basePack();
    p.water.polygon = [0.2, 0.2, 0.8];
    expect(parsePack(p)).toBeNull();
  });

  it("clamps out-of-range polygon coordinates into 0..1", () => {
    const p = basePack();
    p.water.polygon = [0.2, 0.2, 1.8, 0.2, 0.8, 0.8, 0.2, 0.8];
    const out = parsePack(p)!;
    expect(out.water.polygon[2]).toBe(1);
  });

  it("rejects a polygon with a non-numeric coordinate", () => {
    const p = basePack();
    p.water.polygon = [0.2, 0.2, "x", 0.2, 0.8, 0.8, 0.2, 0.8] as unknown as number[];
    expect(parsePack(p)).toBeNull();
  });

  it("drops obstacles with a non-positive radius", () => {
    const p = basePack();
    p.water.obstacles = [
      { x: 0.5, y: 0.5, r: 0.05 },
      { x: 0.3, y: 0.3, r: 0 },
    ];
    const out = parsePack(p)!;
    expect(out.water.obstacles).toHaveLength(1);
  });
});

describe("seasonForDate", () => {
  const cases: [number, string][] = [
    [1, "winter"],
    [2, "winter"],
    [3, "spring"],
    [5, "spring"],
    [6, "summer"],
    [8, "summer"],
    [9, "autumn"],
    [11, "autumn"],
    [12, "winter"],
  ];
  for (const [month, season] of cases)
    it(`maps month ${month} to ${season}`, () => {
      expect(seasonForDate(new Date(2026, month - 1, 15))).toBe(season);
    });
});

describe("pickSeason", () => {
  const have = { spring: {}, autumn: {} } as unknown as PondPack["seasons"];

  it("returns the exact season when present", () => {
    expect(pickSeason(have, "spring")).toBe("spring");
  });

  it("falls back to the nearest available season cyclically", () => {
    expect(pickSeason(have, "summer")).toBe("spring");
    expect(pickSeason(have, "winter")).toBe("autumn");
  });

  it("returns the only season when one exists", () => {
    const one = { winter: {} } as unknown as PondPack["seasons"];
    expect(pickSeason(one, "summer")).toBe("winter");
  });
});
