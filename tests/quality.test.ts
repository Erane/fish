import { describe, expect, test } from "vite-plus/test";
import { QUALITY_SPEC, renderSizes, tierDpr } from "../src/render/quality.ts";

describe("tierDpr", () => {
  test("eco 固定 1，high 封顶 2，ultra 取原生", () => {
    expect(tierDpr("eco", 3)).toBe(1);
    expect(tierDpr("high", 3)).toBe(2);
    expect(tierDpr("ultra", 3)).toBe(3);
    expect(tierDpr("high", 1)).toBe(1);
  });
});

describe("renderSizes", () => {
  test("eco 主画布封顶 1.6MP，辅助 pass 为画布的 1/3", () => {
    const s = renderSizes(1920, 1080, 1, "eco");
    expect(s.cw * s.ch).toBeLessThanOrEqual(1.6e6);
    expect(s.shadow).toEqual([Math.ceil(s.cw / 3), Math.ceil(s.ch / 3)]);
    expect(s.caustic).toEqual(s.shadow);
    expect(s.surface).toEqual(s.shadow);
  });

  test("high 主画布封顶 8.3MP（4K 原生），辅助 pass 为画布的 1/2", () => {
    const s = renderSizes(1920, 1080, 2, "high");
    expect(s.cw).toBe(3840);
    expect(s.ch).toBe(2160);
    expect(s.shadow).toEqual([Math.ceil(s.cw / 2), Math.ceil(s.ch / 2)]);
  });

  test("high 在超过 4K 原生像素量时收敛回上限内", () => {
    const s = renderSizes(3840, 2160, 2, "high");
    expect(s.cw).toBe(3840);
    expect(s.ch).toBe(2160);
  });

  test("ultra 不封顶，主画布为原生设备像素", () => {
    const s = renderSizes(3840, 2160, 2, "ultra");
    expect(s.cw).toBe(7680);
    expect(s.ch).toBe(4320);
  });

  test("辅助 pass 尺寸与屏幕分辨率解耦（8K 与 4K 的 high 一致）", () => {
    const a = renderSizes(3840, 2160, 1, "high");
    const b = renderSizes(7680, 4320, 1, "high");
    expect(b.shadow).toEqual(a.shadow);
    expect(b.caustic).toEqual(a.caustic);
    expect(b.surface).toEqual(a.surface);
    expect(b.cloud).toEqual(a.cloud);
  });

  test("涟漪仿真网格有界", () => {
    for (const q of ["ultra", "high", "eco"] as const) {
      const s = renderSizes(7680, 4320, 3, q);
      expect(s.sim[0]).toBeLessThanOrEqual(900);
      expect(s.sim[1]).toBeLessThanOrEqual(900);
      expect(QUALITY_SPEC[q].frameHz).toBeGreaterThan(0);
    }
  });
});
