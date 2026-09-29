import { describe, it, expect } from "vite-plus/test";
import {
  AMBIENT_SYNTH,
  band,
  bubble,
  loopLfo,
  noise,
  normalize,
  onePole,
  pluck,
  struck,
  weatherLayers,
} from "../src/audio/synth.ts";

const maxAbs = (d: Float32Array): number => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const finite = (d: Float32Array): boolean => d.every((v) => Number.isFinite(v));
const rms = (d: Float32Array, from: number, to: number): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

describe("noise", () => {
  it("fills the requested length within unit range", () => {
    const d = noise(1000);
    expect(d.length).toBe(1000);
    expect(finite(d)).toBe(true);
    expect(maxAbs(d)).toBeLessThanOrEqual(1);
    expect(maxAbs(d)).toBeGreaterThan(0.5);
  });
});

describe("onePole / band", () => {
  it("lowpass keeps output finite and in range", () => {
    const d = onePole(noise(4000), 800, 22050);
    expect(finite(d)).toBe(true);
    expect(maxAbs(d)).toBeLessThan(1);
  });
  it("bandpass removes DC so the mean is near zero", () => {
    const d = band(noise(8000), 200, 3000, 22050);
    const mean = d.reduce((s, v) => s + v, 0) / d.length;
    expect(Math.abs(mean)).toBeLessThan(0.02);
  });
});

describe("bubble", () => {
  it("wraps around the loop end without throwing and adds energy", () => {
    const n = 1000;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    bubble(L, R, 22050, (n - 20) / 22050, 600, 0.02, 0.5, 0, 0.8);
    expect(finite(L)).toBe(true);
    expect(maxAbs(L)).toBeGreaterThan(0);
    expect(maxAbs(L.slice(0, 60))).toBeGreaterThan(0);
  });
});

describe("normalize", () => {
  it("scales the peak to the target", () => {
    const L = new Float32Array([0.1, -0.5, 0.3]);
    const R = new Float32Array([0.2, 0.25, -0.1]);
    normalize(L, R, 0.8);
    expect(maxAbs(L)).toBeCloseTo(0.8, 6);
    expect(maxAbs(R)).toBeLessThanOrEqual(0.8 + 1e-6);
  });
});

describe("loopLfo", () => {
  it("is periodic across the loop for whole cycles", () => {
    const n = 1000;
    const lfo = loopLfo(n, [
      [3, 0.2, 0],
      [5, 0.1, 1],
    ]);
    expect(lfo(0)).toBeCloseTo(lfo(n), 6);
    expect(lfo(0)).toBeCloseTo(1 + 0.2 * Math.sin(0) + 0.1 * Math.sin(1), 6);
  });
});

describe("AMBIENT_SYNTH", () => {
  const sr = 16000;
  const cases: [string, () => [Float32Array, Float32Array], number, number][] = [
    ["stream", () => AMBIENT_SYNTH.stream(sr), sr * 12, 0.8],
    ["spring", () => AMBIENT_SYNTH.spring(sr), sr * 10, 0.7],
    ["cascade", () => AMBIENT_SYNTH.cascade(sr), sr * 12, 0.75],
    ["lapping", () => AMBIENT_SYNTH.lapping(sr), sr * 12, 0.6],
    ["trickle", () => AMBIENT_SYNTH.trickle(sr), sr * 10, 0.5],
    ["night", () => AMBIENT_SYNTH.night(sr), sr * 8, 0.7],
    ["rainLight", () => AMBIENT_SYNTH.rain(sr, 0.25), sr * 10, 0.45 + 0.3 * 0.25],
    ["rainHeavy", () => AMBIENT_SYNTH.rain(sr, 1), sr * 10, 0.75],
  ];
  for (const [name, make, len, peak] of cases) {
    it(`${name} renders a finite stereo loop at the target peak`, () => {
      const [L, R] = make();
      expect(L.length).toBe(len);
      expect(R.length).toBe(len);
      expect(finite(L)).toBe(true);
      expect(finite(R)).toBe(true);
      expect(Math.max(maxAbs(L), maxAbs(R))).toBeCloseTo(peak, 4);
    });
  }
});

describe("pluck", () => {
  it("renders the requested duration and decays toward the tail", () => {
    const sr = 22050;
    const d = pluck(sr, 220, 3);
    expect(d.length).toBe(sr * 3);
    expect(finite(d)).toBe(true);
    const mid = rms(d, Math.floor(sr * 0.2), Math.floor(sr * 0.5));
    const tail = rms(d, Math.floor(sr * 2.4), Math.floor(sr * 2.7));
    expect(tail).toBeLessThan(mid);
  });
});

describe("struck", () => {
  it("renders inharmonic partials normalized near 0.8", () => {
    const sr = 22050;
    const d = struck(
      sr,
      261.63,
      4,
      [
        [1, 1, 6, 0.9],
        [2.71, 0.45, 4, 1.6],
      ],
      0.2,
    );
    expect(d.length).toBe(sr * 4);
    expect(finite(d)).toBe(true);
    expect(maxAbs(d)).toBeCloseTo(0.8, 4);
  });
  it("skips partials above the nyquist limit but still renders", () => {
    const sr = 8000;
    const d = struck(
      sr,
      200,
      1,
      [
        [1, 1, 3, 0.5],
        [40, 0.5, 2, 1],
      ],
      0.1,
    );
    expect(finite(d)).toBe(true);
    expect(maxAbs(d)).toBeGreaterThan(0);
  });
});

describe("weatherLayers", () => {
  it("mixes light and heavy rain by amount", () => {
    const l = weatherLayers({ weather: "rain", night: false, rain: 1 });
    expect(l.rainLight).toBeCloseTo(0.35, 6);
    expect(l.rainHeavy).toBeCloseTo(1, 6);
  });
  it("uses the night insects when dark and not snowing", () => {
    expect(weatherLayers({ weather: "sunny", night: true, rain: 0.5 })).toEqual({ night: 0.9 });
  });
  it("is silent by day and excludes snow at night", () => {
    expect(weatherLayers({ weather: "sunny", night: false, rain: 0.5 })).toEqual({});
    expect(weatherLayers({ weather: "snow", night: true, rain: 0.5 })).toEqual({});
  });
});
