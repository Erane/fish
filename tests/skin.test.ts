import { describe, expect, it } from "vite-plus/test";
import { BODY } from "../src/core/index.ts";
import { alphaBox, widthsFromAlpha } from "../src/art/skin.ts";

function rgba(w: number, h: number, fill: (x: number, y: number) => number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = fill(x, y);
      const i = (y * w + x) * 4;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = a;
    }
  return d;
}

describe("alphaBox", () => {
  it("bounds the opaque region", () => {
    const d = rgba(6, 5, (x, y) => (x >= 2 && x <= 4 && y >= 1 && y <= 3 ? 200 : 0));
    expect(alphaBox(d, 6, 5)).toEqual([2, 1, 4, 3]);
  });

  it("falls back to the full frame when nothing is opaque", () => {
    const d = rgba(4, 4, () => 0);
    expect(alphaBox(d, 4, 4)).toEqual([0, 0, 3, 3]);
  });
});

describe("widthsFromAlpha", () => {
  const W = 96;
  const H = 29;
  it("measures half-extent per body segment", () => {
    const band = rgba(W, H, (x, y) =>
      x < 2 || x > 93 ? 0 : x <= 40 ? 255 : Math.abs(y - 14) <= 7 ? 255 : 0,
    );
    const w = widthsFromAlpha(band, W, H);
    expect(w.length).toBe(BODY.segments + 1);
    for (let i = 0; i < BODY.segments + 1; i++) {
      const x = BODY.nose - (i * BODY.length) / BODY.segments;
      const px = Math.round(((x - BODY.left) / BODY.width) * (W - 1));
      const want = px <= 40 ? 1 : 0.5;
      expect(w[i]).toBeCloseTo(want, 2);
    }
  });

  it("is zero where the column has no alpha", () => {
    const empty = rgba(W, H, () => 0);
    const w = widthsFromAlpha(empty, W, H);
    for (let i = 0; i <= BODY.segments; i++) expect(w[i]).toBe(0);
  });
});
