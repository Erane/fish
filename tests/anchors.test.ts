import { describe, expect, it } from "vite-plus/test";
import { generateBed } from "../src/render/bedShapes.ts";
import type { BedShape, ShapeKind } from "../src/render/bedShapes.ts";
import {
  budAnchors,
  crabHomes,
  floatShapes,
  isBigLeaf,
  obstacleAnchors,
  spotAnchors,
} from "../src/scene/anchors.ts";

function shape(kind: ShapeKind, x: number, y: number, size: number, above = 1): BedShape {
  return { kind, x, y, size, rot: 0, poly: [0, 0], fill: "#000", z: 0, above, shadow: 0, wet: 0 };
}

describe("anchors derive from the shape list", () => {
  it("floatShapes keeps only above-water shapes, rocks first then leaves large to small", () => {
    const list = [
      shape("leaf", 0.2, 0.2, 0.05),
      shape("rock", 0.8, 0.8, 0.09),
      shape("leaf", 0.3, 0.3, 0.08),
      shape("stone", 0.5, 0.5, 0.02, 0),
    ];
    const out = floatShapes(list);
    expect(out.map((s) => s.kind)).toEqual(["rock", "leaf", "leaf"]);
    expect(out[1]!.size).toBe(0.08);
    expect(out[2]!.size).toBe(0.05);
  });

  it("spotAnchors takes only sizable leaves and flowers", () => {
    const list = [
      shape("leaf", 0.1, 0.1, 0.07),
      shape("leaf", 0.2, 0.2, 0.02),
      shape("flower", 0.3, 0.3, 0.04),
    ];
    expect(spotAnchors(list)).toEqual([
      [0.1, 0.1],
      [0.3, 0.3],
    ]);
  });

  it("budAnchors prefers buds and falls back to flowers", () => {
    const buds = [shape("bud", 0.4, 0.4, 0.02), shape("flower", 0.6, 0.6, 0.04)];
    expect(budAnchors(buds)).toHaveLength(1);
    expect(budAnchors([shape("flower", 0.6, 0.6, 0.04)])).toEqual([[0.6, 0.6 - 0.04 * 0.7]]);
  });

  it("crabHomes are the rocks that break the surface", () => {
    const list = [
      shape("rock", 0.1, 0.1, 0.09),
      shape("rock", 0.2, 0.2, 0.05, 0),
      shape("leaf", 0.3, 0.3, 0.08),
    ];
    expect(crabHomes(list)).toEqual([{ x: 0.1, y: 0.1, rx: 0.09, ry: 0.072 }]);
  });

  it("obstacleAnchors cover surfaced rocks and big leaves only", () => {
    const list = [
      shape("rock", 0.1, 0.1, 0.09),
      shape("leaf", 0.2, 0.2, 0.08),
      shape("leaf", 0.3, 0.3, 0.03),
      shape("rock", 0.4, 0.4, 0.06, 0),
    ];
    expect(obstacleAnchors(list)).toEqual([
      { x: 0.1, y: 0.1, r: 0.09 * 0.95 },
      { x: 0.2, y: 0.2, r: 0.08 * 0.55 },
    ]);
    expect(isBigLeaf(list[1]!)).toBe(true);
    expect(isBigLeaf(list[2]!)).toBe(false);
  });

  it("the seeded bed yields usable anchors", () => {
    const shapes = generateBed(7);
    expect(floatShapes(shapes).length).toBeGreaterThan(10);
    expect(spotAnchors(shapes).length).toBeGreaterThan(3);
    expect(budAnchors(shapes).length).toBeGreaterThan(0);
    expect(crabHomes(shapes).length).toBeGreaterThan(2);
    expect(obstacleAnchors(shapes).length).toBeGreaterThan(3);
  });
});
