import { describe, expect, it } from "vite-plus/test";
import { bedToScreen, depthAtScreen, fitBed } from "../src/render/bed.ts";
import type { BedTransform } from "../src/render/bed.ts";
import type { DepthField } from "../src/core/index.ts";

function bedUvAt(
  bed: BedTransform,
  w: number,
  h: number,
  px: number,
  py: number,
): [number, number] {
  const sx = px / w;
  const sy = py / h;
  return [bed.u[0] * sx + bed.u[1] * sy + bed.u[2], bed.v[0] * sx + bed.v[1] * sy + bed.v[2]];
}

describe("fitBed / bedToScreen", () => {
  const cases: [string, number, number, number, number][] = [
    ["landscape bed on landscape screen", 1672, 941, 1440, 900],
    ["landscape bed on portrait screen (turned)", 1672, 941, 400, 820],
    ["square bed on square screen", 1000, 1000, 600, 600],
    ["tall bed on wide screen", 800, 1400, 1200, 700],
  ];

  for (const [name, W, H, w, h] of cases) {
    it(`inverts the affine map: ${name}`, () => {
      const bed = fitBed(W, H, w, h);
      for (const [px, py] of [
        [0, 0],
        [w, h],
        [w / 2, h / 2],
        [w * 0.13, h * 0.77],
      ] as [number, number][]) {
        const [iu, iv] = bedUvAt(bed, w, h, px, py);
        const [bx, by] = bedToScreen(bed, iu, iv, w, h);
        expect(bx).toBeCloseTo(px, 3);
        expect(by).toBeCloseTo(py, 3);
      }
    });

    it(`covers the screen with bed uv in range: ${name}`, () => {
      const bed = fitBed(W, H, w, h);
      for (const [px, py] of [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
        [w / 2, h / 2],
      ] as [number, number][]) {
        const [iu, iv] = bedUvAt(bed, w, h, px, py);
        expect(iu).toBeGreaterThanOrEqual(-1e-6);
        expect(iu).toBeLessThanOrEqual(1 + 1e-6);
        expect(iv).toBeGreaterThanOrEqual(-1e-6);
        expect(iv).toBeLessThanOrEqual(1 + 1e-6);
      }
    });
  }

  it("turns the painting a quarter on a portrait screen only", () => {
    expect(fitBed(1672, 941, 1440, 900).turn).toBe(0);
    expect(fitBed(1672, 941, 400, 820).turn).toBe(1);
    expect(fitBed(1672, 941, 400, 820, false).turn).toBe(0);
  });
});

describe("depthAtScreen", () => {
  it("is zero with no depth field", () => {
    expect(depthAtScreen(null, fitBed(100, 100, 100, 100), 100, 100, 50, 50)).toBe(0);
  });

  it("samples the field through the bed transform", () => {
    const field: DepthField = { w: 2, h: 2, data: new Float32Array([0, 0, 0, 1]) };
    const bed = fitBed(2, 2, 100, 100);
    const d = depthAtScreen(field, bed, 100, 100, 50, 50);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
  });
});
