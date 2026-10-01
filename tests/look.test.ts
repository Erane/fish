import { describe, expect, it } from "vite-plus/test";
import type { Weather } from "../src/core/types.ts";
import { lookFor } from "../src/scene/look.ts";

const WEATHERS: Weather[] = ["sunny", "cloudy", "rain", "snow"];

describe("lookFor", () => {
  it("never draws the moon by day", () => {
    for (const w of WEATHERS) expect(lookFor(w, false).moon).toBe(0);
  });

  it("lets cloud cover alone decide how much moon survives at night", () => {
    for (const w of WEATHERS) expect(lookFor(w, true).moon).toBe(1);
  });

  it("saturates the cloud field when the sky is fully overcast", () => {
    expect(lookFor("rain", true, 1).cloudCover).toBeGreaterThanOrEqual(0.85);
  });

  it("keeps the calm bed light baseline for every weather but rain", () => {
    for (const w of ["sunny", "cloudy", "snow"] as Weather[]) {
      expect(lookFor(w, false).causticFloor).toBe(0.06);
      expect(lookFor(w, false).rippleDamp).toBe(0.994);
    }
  });

  it("diffuses the bed light instead of crushing it when it rains", () => {
    for (const k of [0, 0.5, 1]) {
      const l = lookFor("rain", false, k);
      expect(l.causticFloor).toBeGreaterThan(0.06);
      expect(l.caustic).toBeLessThan(0.22);
    }
  });

  it("fades rain ripples faster as the rain gets heavier", () => {
    const d = [0, 0.5, 1].map((k) => lookFor("rain", false, k).rippleDamp);
    expect(d[1]!).toBeLessThan(d[0]!);
    expect(d[2]!).toBeLessThan(d[1]!);
    for (const v of d) expect(v).toBeGreaterThan(0.9);
  });

  it("keeps a diffuse moon glow behind heavy snow clouds", () => {
    expect(lookFor("snow", true, 0.5, 1).moonFloor).toBeGreaterThan(0);
    expect(lookFor("snow", true, 0.5, 1).moonFloor).toBeLessThan(1);
  });

  it("keeps the rain night moonless so no pale smudge returns", () => {
    for (const k of [0, 0.5, 1]) expect(lookFor("rain", true, k).moonFloor).toBe(0);
    for (const w of WEATHERS)
      expect(lookFor(w, false, 0.5, 0.5).moonFloor).toBeGreaterThanOrEqual(0);
  });

  it("maps rain to a stepped curve that stays below the sunny surface energy", () => {
    const k2 = [0, 0.5, 1].map((k) => lookFor("rain", false, k));
    for (const [a, b] of [
      [k2[0]!, k2[1]!],
      [k2[1]!, k2[2]!],
    ]) {
      expect(b.wave).toBeGreaterThanOrEqual(a.wave);
      expect(b.ripple).toBeGreaterThanOrEqual(a.ripple);
      expect(b.skyK).toBeGreaterThanOrEqual(a.skyK);
      expect(b.mist).toBeGreaterThanOrEqual(a.mist);
      expect(b.caustic).toBeLessThanOrEqual(a.caustic);
      expect(b.sat).toBeLessThanOrEqual(a.sat);
    }
    const s = lookFor("sunny", false);
    const r = k2[2]!;
    expect(r.wave).toBeLessThanOrEqual(s.wave + 0.4);
    expect(r.skyK).toBeLessThan(0.15);
    expect(r.mist).toBeLessThan(0.1);
    expect(k2[0]!.wave).toBeLessThan(s.wave + 0.1);
  });
});
