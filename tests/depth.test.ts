import { describe, expect, it } from "vite-plus/test";
import { depthFromPolygon } from "../src/core/depth.ts";

const SQUARE = [0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75];

describe("depthFromPolygon", () => {
  it("zeroes land cells outside the polygon", () => {
    const d = depthFromPolygon(SQUARE, 8, 8);
    expect(d.w).toBe(8);
    expect(d.h).toBe(8);
    expect(d.data[0]!).toBe(0);
    expect(d.data[8 * 8 - 1]!).toBe(0);
  });

  it("caps the deepest point at 1 and keeps values in range", () => {
    const d = depthFromPolygon(SQUARE, 8, 8);
    expect(Math.max(...Array.from(d.data))).toBe(1);
    for (const v of Array.from(d.data)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is symmetric for a symmetric polygon", () => {
    const d = depthFromPolygon(SQUARE, 16, 16);
    for (let y = 0; y < d.h; y++)
      for (let x = 0; x < d.w; x++)
        expect(d.data[y * d.w + x]).toBeCloseTo(d.data[y * d.w + (d.w - 1 - x)]!, 6);
  });

  it("ranks offshore nearer the shore shallower", () => {
    const d = depthFromPolygon(SQUARE, 8, 8);
    expect(d.data[1 * 8 + 4]!).toBeLessThan(d.data[3 * 8 + 4]!);
    expect(d.data[3 * 8 + 4]!).toBeGreaterThan(0);
  });

  it("follows a concave outline", () => {
    const L = [0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.6, 0.9, 0.6, 0.4, 0.1, 0.4];
    const d = depthFromPolygon(L, 10, 10);
    expect(d.data[7 * 10 + 7]!).toBeGreaterThan(d.data[1 * 10 + 1]!);
    expect(d.data[7 * 10 + 2]!).toBe(0);
  });

  it("returns all zeros for a degenerate polygon", () => {
    const d = depthFromPolygon([0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 4, 4);
    for (const v of Array.from(d.data)) expect(v).toBe(0);
  });
});
