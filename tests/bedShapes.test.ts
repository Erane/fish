import { describe, expect, it } from "vite-plus/test";
import { bedDepth } from "../src/render/bedPaint.ts";
import { generateBed } from "../src/render/bedShapes.ts";
import type { BedShape } from "../src/render/bedShapes.ts";

const corners: [string, number, number][] = [
  ["top-left", 0.07, 0.08],
  ["bottom-left", 0.1, 0.88],
  ["top-right", 0.92, 0.1],
  ["bottom-right", 0.9, 0.88],
];

describe("generateBed", () => {
  it("is deterministic for a seed and varies across seeds", () => {
    const a = generateBed(7);
    const b = generateBed(7);
    const c = generateBed(8);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("produces every shape family the cel look needs", () => {
    const kinds = new Set(generateBed(7).map((s) => s.kind));
    for (const k of ["sand", "sandPatch", "stone", "moss", "rock", "leaf", "flower", "penny"])
      expect(kinds.has(k as BedShape["kind"])).toBe(true);
  });

  it("draws back-to-front by z", () => {
    const list = generateBed(7);
    for (let i = 1; i < list.length; i++) expect(list[i]!.z).toBeGreaterThanOrEqual(list[i - 1]!.z);
  });

  it("keeps well-formed finite polygons inside the frame", () => {
    for (const s of generateBed(7)) {
      expect(s.poly.length % 2).toBe(0);
      expect(s.poly.length).toBeGreaterThanOrEqual(6);
      for (const v of s.poly) expect(Number.isFinite(v)).toBe(true);
      expect(s.x).toBeGreaterThanOrEqual(-0.1);
      expect(s.x).toBeLessThanOrEqual(1.1);
      expect(s.y).toBeGreaterThanOrEqual(-0.1);
      expect(s.y).toBeLessThanOrEqual(1.1);
    }
  });

  it("hugs each corner with above-water lotus", () => {
    const list = generateBed(7).filter((s) => s.above > 0 && s.kind === "leaf");
    for (const [name, cx, cy] of corners) {
      const near = list.some((s) => Math.hypot(s.x - cx, s.y - cy) < 0.22);
      expect(near, `${name} cluster missing`).toBe(true);
    }
  });

  it("leaves the middle open water", () => {
    const inMiddle = generateBed(7).filter(
      (s) => s.above > 0 && s.x > 0.32 && s.x < 0.68 && s.y > 0.3 && s.y < 0.7,
    );
    expect(inMiddle.length).toBe(0);
  });
});

describe("bedDepth", () => {
  const field = bedDepth(generateBed(7), 1600, 900);

  it("normalises so the deepest spot is full", () => {
    let peak = 0;
    for (let i = 0; i < field.data.length; i++) peak = Math.max(peak, field.data[i]!);
    expect(peak).toBeCloseTo(1, 3);
  });

  it("is deeper in the open middle than at a lotus bank", () => {
    const at = (u: number, v: number) =>
      field.data[Math.round(v * (field.h - 1)) * field.w + Math.round(u * (field.w - 1))]!;
    expect(at(0.5, 0.5)).toBeGreaterThan(at(0.07, 0.08));
    expect(at(0.5, 0.5)).toBeGreaterThan(at(0.9, 0.88));
  });

  it("stays within range everywhere", () => {
    for (let i = 0; i < field.data.length; i++) {
      const v = field.data[i]!;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
