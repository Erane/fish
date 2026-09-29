import { describe, expect, it } from "vite-plus/test";
import { pointInPoly, signedDistToPoly, pushInside } from "../src/core/boundary.ts";
import { createFish, PondSimulation, randomSeed } from "../src/core/index.ts";

const SQUARE = [0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8];

describe("pointInPoly", () => {
  it("detects interior and exterior", () => {
    expect(pointInPoly(0.5, 0.5, SQUARE)).toBe(true);
    expect(pointInPoly(0.1, 0.5, SQUARE)).toBe(false);
    expect(pointInPoly(0.9, 0.9, SQUARE)).toBe(false);
  });
});

describe("signedDistToPoly", () => {
  it("is positive inside and negative outside", () => {
    expect(signedDistToPoly(0.5, 0.5, SQUARE)).toBeGreaterThan(0);
    expect(signedDistToPoly(0.1, 0.5, SQUARE)).toBeLessThan(0);
  });

  it("measures perpendicular distance to the nearest edge", () => {
    expect(signedDistToPoly(0.5, 0.5, SQUARE)).toBeCloseTo(0.3, 5);
    expect(signedDistToPoly(0.5, 0.3, SQUARE)).toBeCloseTo(0.1, 5);
    expect(signedDistToPoly(0.5, 0.1, SQUARE)).toBeCloseTo(-0.1, 5);
  });
});

describe("pushInside", () => {
  it("leaves a point already inside by more than the margin untouched", () => {
    const [x, y] = pushInside(0.5, 0.5, SQUARE, 0.05);
    expect(x).toBeCloseTo(0.5, 5);
    expect(y).toBeCloseTo(0.5, 5);
  });

  it("moves an outside point back inside the margin", () => {
    const [x, y] = pushInside(0.5, 0.05, SQUARE, 0.1);
    expect(signedDistToPoly(x, y, SQUARE)).toBeGreaterThanOrEqual(0.1 - 1e-6);
  });
});

describe("PondSimulation with a polygon boundary", () => {
  it("keeps every fish inside the water region", () => {
    const random = randomSeed(5);
    const W = 800;
    const H = 600;
    const fish = Array.from({ length: 12 }, (_, i) => createFish(i, random));
    const pond = new PondSimulation(fish, W, H, random);
    pond.boundary = [200, 150, 600, 150, 600, 450, 200, 450];
    for (let i = 0; i < 2500; i++) pond.step(0.04);
    for (const f of fish) {
      expect(pointInPoly(f.x * W, f.y * H, pond.boundary!)).toBe(true);
      expect(Number.isFinite(f.angle)).toBe(true);
    }
  });
});
