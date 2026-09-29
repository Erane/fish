import { describe, it, expect } from "vite-plus/test";
import { moonPhase, MONTH } from "../src/scene/moon.ts";
import { TAU } from "../src/core/index.ts";

describe("moonPhase", () => {
  it("is deterministic for a fixed date", () => {
    const d = new Date(Date.UTC(2026, 8, 29, 12, 0, 0));
    expect(moonPhase(d).age).toBe(moonPhase(d).age);
    expect(moonPhase(d).illum).toBe(moonPhase(d).illum);
  });

  it("keeps age within one synodic month", () => {
    for (let i = 0; i < 400; i++) {
      const { age } = moonPhase(new Date(Date.UTC(2024, 0, 1) + i * 864e5));
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(MONTH);
    }
  });

  it("keeps angle and illum in range", () => {
    const { angle, illum } = moonPhase(new Date(Date.UTC(2026, 8, 29)));
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(TAU);
    expect(illum).toBeGreaterThanOrEqual(0);
    expect(illum).toBeLessThanOrEqual(1);
  });

  it("reports new moon near the reference epoch", () => {
    const { illum, name } = moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)));
    expect(illum).toBeLessThan(0.01);
    expect(name).toBe("新月");
  });

  it("reports full moon about half a month later", () => {
    const { illum } = moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14) + (MONTH / 2) * 864e5));
    expect(illum).toBeGreaterThan(0.99);
  });
});
