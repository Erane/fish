import type { Weather } from "../core/types.ts";

export const TAU = Math.PI * 2;
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export type Stereo = [Float32Array, Float32Array];
export type Lfo = (i: number) => number;
export type StruckPartial = readonly [ratio: number, amp: number, decay: number, beat: number];

export function noise(n: number): Float32Array {
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return d;
}

export function onePole(
  data: Float32Array,
  cutoff: number,
  sr: number,
  high = false,
): Float32Array {
  const a = Math.exp((-TAU * cutoff) / sr);
  let y = 0;
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      y = (1 - a) * x + a * y;
      if (pass) data[i] = high ? x - y : y;
    }
  return data;
}

export const band = (d: Float32Array, lo: number, hi: number, sr: number): Float32Array =>
  onePole(onePole(d, hi, sr), lo, sr, true);

export function mixInto(
  L: Float32Array,
  R: Float32Array,
  src: Float32Array,
  gain: number,
  pan = 0,
  lfo?: Lfo,
): void {
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * gain;
  const gr = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  for (let i = 0; i < src.length; i++) {
    const k = lfo ? lfo(i) : 1;
    L[i] += src[i] * gl * k;
    R[i] += src[i] * gr * k;
  }
}

export function bubble(
  L: Float32Array,
  R: Float32Array,
  sr: number,
  t0: number,
  f0: number,
  dur: number,
  amp: number,
  pan: number,
  rise: number,
): void {
  const n = Math.floor(dur * sr * 3);
  const start = Math.floor(t0 * sr);
  const len = L.length;
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * amp;
  const gr = Math.sin(((pan + 1) * Math.PI) / 4) * amp;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f0 * (1 + rise * Math.min(1, t / dur));
    ph += (TAU * f) / sr;
    const v = Math.sin(ph) * Math.min(1, t / 0.0012) * Math.exp(-t / (dur * 0.35));
    const k = (start + i) % len;
    L[k] += v * gl;
    R[k] += v * gr;
  }
}

export function normalize(L: Float32Array, R: Float32Array, peak: number): void {
  let m = 1e-6;
  for (let i = 0; i < L.length; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak / m;
  for (let i = 0; i < L.length; i++) {
    L[i] *= k;
    R[i] *= k;
  }
}

export const loopLfo =
  (n: number, parts: readonly (readonly [cycles: number, depth: number, ph: number])[]): Lfo =>
  (i) =>
    parts.reduce((v, [cycles, depth, ph]) => v + depth * Math.sin((TAU * cycles * i) / n + ph), 1);

export const AMBIENT_SYNTH = {
  stream(sr: number): Stereo {
    const n = sr * 12;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (const pan of [-0.6, 0.6])
      mixInto(
        L,
        R,
        band(noise(n), 260, 1500, sr),
        0.32,
        pan,
        loopLfo(n, [
          [2, 0.22, 0],
          [5, 0.12, 1],
          [11, 0.06, 2],
        ]),
      );
    mixInto(L, R, band(noise(n), 60, 260, sr), 0.5, 0);
    for (let t = 0; t < 12; t += rand(0.004, 0.045)) {
      const f0 = 320 * Math.pow(2, rand(0, 2.3));
      const gurgle = Math.random() < 0.05;
      const count = gurgle ? 4 + Math.floor(rand(0, 6)) : 1;
      for (let k = 0; k < count; k++)
        bubble(
          L,
          R,
          sr,
          t + k * rand(0.015, 0.04),
          f0 * rand(0.85, 1.2),
          14 / f0 + rand(0.004, 0.014),
          0.22 * Math.pow(Math.random(), 2.2),
          rand(-0.8, 0.8),
          rand(0.25, 1.1),
        );
    }
    normalize(L, R, 0.8);
    return [L, R];
  },
  rain(sr: number, density: number): Stereo {
    const n = sr * 10;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (const pan of [-0.7, 0.7])
      mixInto(
        L,
        R,
        band(noise(n), 900, 6500, sr),
        0.06 + 0.14 * density,
        pan,
        loopLfo(n, [[3, 0.1, pan]]),
      );
    const gap = 0.025 - 0.021 * density;
    for (let t = 0; t < 10; t += rand(gap * 0.2, gap)) {
      const f0 = 900 * Math.pow(2, rand(0, 2.2));
      bubble(
        L,
        R,
        sr,
        t,
        f0,
        rand(0.003, 0.008),
        0.09 * Math.pow(Math.random(), 1.6),
        rand(-0.9, 0.9),
        rand(0, 0.3),
      );
      if (Math.random() < 0.08) {
        const f1 = 500 * Math.pow(2, rand(0, 1.6));
        bubble(
          L,
          R,
          sr,
          t,
          f1,
          12 / f1 + 0.01,
          0.14 * Math.random(),
          rand(-0.8, 0.8),
          rand(0.5, 1.2),
        );
      }
    }
    normalize(L, R, 0.45 + 0.3 * density);
    return [L, R];
  },
  night(sr: number): Stereo {
    const n = sr * 8;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (let c = 0; c < 4; c++) {
      const f = rand(3900, 5100);
      const per = 8 / Math.round(8 / rand(0.5, 0.95));
      const pulses = 3 + (c % 2);
      const amp = rand(0.05, 0.11);
      const pan = rand(-0.85, 0.85);
      const off = rand(0, per);
      const gl = Math.cos(((pan + 1) * Math.PI) / 4) * amp;
      const gr = Math.sin(((pan + 1) * Math.PI) / 4) * amp;
      for (let t0 = off; t0 < 8 + per; t0 += per)
        for (let p = 0; p < pulses; p++) {
          const s = Math.floor((t0 + p * 0.03) * sr);
          const m = Math.floor(0.016 * sr);
          for (let i = 0; i < m; i++) {
            const env = Math.sin((Math.PI * i) / m) ** 2;
            const v = Math.sin((TAU * f * (s + i)) / sr) * env;
            const k = (s + i) % n;
            L[k] += v * gl;
            R[k] += v * gr;
          }
        }
    }
    mixInto(L, R, band(noise(n), 5200, 9000, sr), 0.018, 0, loopLfo(n, [[48, 0.6, 0]]));
    normalize(L, R, 0.7);
    return [L, R];
  },
  spring(sr: number): Stereo {
    const n = sr * 10;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (const pan of [-0.5, 0.5])
      mixInto(
        L,
        R,
        band(noise(n), 900, 3400, sr),
        0.07,
        pan,
        loopLfo(n, [
          [7, 0.35, pan],
          [13, 0.2, 1],
        ]),
      );
    for (let t = 0; t < 10; t += rand(0.07, 0.45)) {
      const f0 = 850 * Math.pow(2, rand(0, 1.5));
      const amp = rand(0.12, 0.3);
      const pan = rand(-0.6, 0.6);
      const dur = 14 / f0 + 0.02;
      bubble(L, R, sr, t, f0, dur, amp, pan, rand(0.6, 1.4));
      bubble(L, R, sr, t + 0.09, f0, dur, amp * 0.3, -pan, rand(0.6, 1.4));
    }
    normalize(L, R, 0.7);
    return [L, R];
  },
  cascade(sr: number): Stereo {
    const n = sr * 12;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (const pan of [-0.7, 0.7])
      mixInto(
        L,
        R,
        band(noise(n), 180, 5200, sr),
        0.55,
        pan,
        loopLfo(n, [
          [3, 0.12, pan],
          [9, 0.06, 2],
        ]),
      );
    mixInto(L, R, band(noise(n), 70, 220, sr), 0.35, 0, loopLfo(n, [[2, 0.1, 0]]));
    for (let t = 0; t < 12; t += rand(0.002, 0.012)) {
      const f0 = 380 * Math.pow(2, rand(0, 2.4));
      bubble(
        L,
        R,
        sr,
        t,
        f0,
        12 / f0 + 0.005,
        0.1 * Math.pow(Math.random(), 1.8),
        rand(-0.9, 0.9),
        rand(0.3, 1),
      );
    }
    normalize(L, R, 0.75);
    return [L, R];
  },
  lapping(sr: number): Stereo {
    const n = sr * 12;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    const laps: [number, number, number][] = [];
    for (let t = rand(0, 0.5); t < 12; t += rand(1.5, 3))
      laps.push([t, rand(0.6, 1), rand(-0.6, 0.6)]);
    for (const pan of [-0.4, 0.4]) {
      const d = band(noise(n), 90, 700, sr);
      mixInto(L, R, d, 0.7, pan, (i) => {
        const t = i / sr;
        let e = 0.06;
        for (const [t0, a] of laps) {
          const u = (((t - t0) % 12) + 12) % 12;
          e += a * (u < 0.3 ? u / 0.3 : Math.exp(-(u - 0.3) / 0.7));
        }
        return e;
      });
    }
    for (const [t0, a, pan] of laps)
      for (let k = 0; k < 3; k++) {
        const f0 = rand(260, 620);
        bubble(
          L,
          R,
          sr,
          t0 + 0.25 + k * rand(0.05, 0.2),
          f0,
          14 / f0 + 0.03,
          0.18 * a * rand(0.4, 1),
          pan,
          rand(0.3, 0.8),
        );
      }
    normalize(L, R, 0.6);
    return [L, R];
  },
  trickle(sr: number): Stereo {
    const n = sr * 10;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    mixInto(
      L,
      R,
      band(noise(n), 1100, 4200, sr),
      0.16,
      -0.2,
      loopLfo(n, [
        [23, 0.3, 0],
        [41, 0.2, 1],
      ]),
    );
    for (let t = 0; t < 10; t += rand(0.02, 0.09)) {
      const f0 = 1200 * Math.pow(2, rand(0, 1.3));
      bubble(L, R, sr, t, f0, 10 / f0 + 0.004, 0.08 * Math.random(), rand(-0.4, 0.1), rand(0.4, 1));
    }
    normalize(L, R, 0.5);
    return [L, R];
  },
};

export interface SceneState {
  weather: Weather;
  night: boolean;
  rain: number;
}

export type WeatherLoop = "rainLight" | "rainHeavy" | "night";

export function weatherLayers({
  weather,
  night,
  rain,
}: SceneState): Partial<Record<WeatherLoop, number>> {
  if (weather === "rain") return { rainLight: 0.95 - 0.6 * rain, rainHeavy: 0.15 + 0.85 * rain };
  return night && weather !== "snow" ? { night: 0.9 } : {};
}

export function pluck(sr: number, freq: number, dur: number): Float32Array {
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  const N = Math.max(2, Math.round(sr / freq));
  const buf = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += (Math.random() * 2 - 1 - lp) * 0.45;
    buf[i] = lp * (1 - (i / N) * 0.3);
  }
  const decay = Math.pow(0.001, 1 / (Math.max(3, 9 - freq / 60) * freq));
  let idx = 0;
  let body = 0;
  for (let i = 0; i < n; i++) {
    const k = (idx + 1) % N;
    const v = buf[idx];
    buf[idx] = decay * (buf[idx] * 0.52 + buf[k] * 0.48);
    idx = k;
    body += (v - body) * 0.35;
    out[i] =
      (v * 0.55 + body * 0.6) * Math.min(1, i / (sr * 0.003)) * Math.min(1, (n - i) / (sr * 0.3));
  }
  return out;
}

export function struck(
  sr: number,
  f0: number,
  dur: number,
  partials: readonly StruckPartial[],
  strike: number,
): Float32Array {
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  for (const [ratio, amp, decay, beat] of partials) {
    const f = f0 * ratio;
    if (f > sr * 0.45) continue;
    for (const s of [-1, 1]) {
      const w = (TAU * (f + (s * beat) / 2)) / sr;
      const ph = Math.random() * TAU;
      for (let i = 0; i < n; i++)
        out[i] += Math.sin(w * i + ph) * amp * 0.5 * Math.exp(-i / sr / decay);
    }
  }
  const m = Math.floor(sr * 0.02);
  const hit = band(noise(m), f0, f0 * 6, sr);
  for (let i = 0; i < m; i++) out[i] += hit[i] * strike * (1 - i / m);
  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    out[i] *= Math.min(1, i / (sr * 0.004)) * Math.min(1, (n - i) / (sr * 0.5));
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < n; i++) out[i] *= 0.8 / peak;
  return out;
}

export const GUQIN = [130.81, 146.83, 174.61, 196, 220, 261.63, 293.66, 349.23, 392, 440];
export const BOWLS = [146.83, 196, 261.63];
export const TUBES = [523.25, 587.33, 659.25, 783.99, 880];
