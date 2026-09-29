import { describe, expect, it } from "vite-plus/test";
import { girthOf, halfWidth, valueNoise } from "../src/art/koi.ts";

describe("girthOf", () => {
  it("is deterministic and within range", () => {
    for (const seed of [1, 42, 9999]) {
      const g = girthOf(seed);
      expect(girthOf(seed)).toBe(g);
      expect(g).toBeGreaterThanOrEqual(0.93);
      expect(g).toBeLessThan(1.08);
    }
  });
});

describe("halfWidth", () => {
  it("is zero outside the body and positive inside", () => {
    const g = girthOf(7);
    expect(halfWidth(40, g, "kohaku")).toBe(0);
    expect(halfWidth(-40, g, "kohaku")).toBe(0);
    expect(halfWidth(0, g, "kohaku")).toBeGreaterThan(0);
  });

  it("peaks around two fifths back and tapers to the tail", () => {
    const g = girthOf(7);
    const at = (x: number) => halfWidth(x, g, "kohaku");
    expect(at(6)).toBeGreaterThan(at(30));
    expect(at(6)).toBeGreaterThan(at(-20));
  });

  it("gives the silver carp a narrower, longer body", () => {
    const g = girthOf(7);
    expect(halfWidth(-30, g, "silvercarp")).toBeGreaterThan(0);
    expect(halfWidth(-30, g, "kohaku")).toBeLessThan(1e-3);
    expect(halfWidth(6, g, "silvercarp")).toBeLessThan(halfWidth(6, g, "kohaku"));
  });
});

describe("valueNoise", () => {
  it("is deterministic and bounded to [0,1]", () => {
    const n = valueNoise(3);
    const m = valueNoise(3);
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const y = i * 0.11;
      const v = n(x, y);
      expect(v).toBe(m(x, y));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
