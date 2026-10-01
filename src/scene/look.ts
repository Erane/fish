import { DEEP_TINT } from "../core/index.ts";
import type { Weather } from "../core/types.ts";
import { GRADE } from "../style.ts";
import type { Look, Vec3 } from "../render/types.ts";

type LookBase = Omit<
  Look,
  | "sun"
  | "moonDisc"
  | "causticCell"
  | "cloudWind"
  | "shadowDir"
  | "snowCover"
  | "wetCover"
  | "rainK"
  | "flash"
>;

const LOOKS: Record<Weather, LookBase> = {
  sunny: {
    sunK: 1,
    bright: 1.04,
    sat: 0.92,
    tint: [1.01, 1, 0.985],
    caustic: 0.22,
    causticTint: [1, 0.97, 0.84],
    causticFloor: 0.06,
    glint: 0.85,
    glintColor: [1, 0.96, 0.84],
    sky: [0.86, 0.93, 0.94],
    skyK: 0.025,
    cloudCover: 0.14,
    cloudShade: 0.3,
    wave: 0.6,
    refract: 14,
    ripple: 9,
    rippleDamp: 0.994,
    shade: 0.26,
    shadow: 0.74,
    vignette: 0.42,
    water: [0.34, 0.47, 0.4],
    moon: 0,
    moonFloor: 0,
    sheenFloor: 0,
    mist: 0,
    depth: 1,
    posterize: GRADE.posterize,
    posterMix: GRADE.posterMix,
    paperMix: GRADE.paperMix,
    paperLift: GRADE.paperLift,
    grain: GRADE.noise,
  },
  cloudy: {
    sunK: 0.95,
    bright: 1,
    sat: 0.86,
    tint: [1, 1, 1.005],
    caustic: 0.18,
    causticTint: [1, 0.97, 0.88],
    causticFloor: 0.06,
    glint: 0.7,
    glintColor: [1, 0.96, 0.86],
    sky: [0.82, 0.87, 0.88],
    skyK: 0.05,
    cloudCover: 0.56,
    cloudShade: 0.42,
    wave: 0.7,
    refract: 14,
    ripple: 9,
    rippleDamp: 0.994,
    shade: 0.22,
    shadow: 0.7,
    vignette: 0.46,
    water: [0.35, 0.46, 0.42],
    moon: 0,
    moonFloor: 0,
    sheenFloor: 0,
    mist: 0,
    depth: 1,
    posterize: 14,
    posterMix: 0.5,
    paperMix: 0.26,
    paperLift: GRADE.paperLift,
    grain: 0.016,
  },
  rain: {
    sunK: 0.4,
    bright: 0.86,
    sat: 0.68,
    tint: [0.95, 0.99, 1.03],
    caustic: 0.1,
    causticTint: [0.92, 0.97, 1],
    causticFloor: 0.4,
    glint: 0.12,
    glintColor: [0.9, 0.95, 1],
    sky: [0.68, 0.74, 0.78],
    skyK: 0.075,
    cloudCover: 0.78,
    cloudShade: 0.08,
    wave: 0.6,
    refract: 15,
    ripple: 9,
    rippleDamp: 0.994,
    shade: 0.26,
    shadow: 0.46,
    vignette: 0.5,
    water: [0.32, 0.44, 0.42],
    moon: 0,
    moonFloor: 0,
    sheenFloor: 0.62,
    mist: 0.03,
    depth: 0.8,
    posterize: 14,
    posterMix: 0.5,
    paperMix: 0.24,
    paperLift: GRADE.paperLift,
    grain: 0.016,
  },
  snow: {
    sunK: 0.55,
    bright: 0.98,
    sat: 0.64,
    tint: [1, 1.01, 1.05],
    caustic: 0.06,
    causticTint: [0.95, 0.98, 1],
    causticFloor: 0.06,
    glint: 0.28,
    glintColor: [0.95, 0.98, 1],
    sky: [0.9, 0.93, 0.96],
    skyK: 0.11,
    cloudCover: 0.75,
    cloudShade: 0.2,
    wave: 0.42,
    refract: 13,
    ripple: 8,
    rippleDamp: 0.994,
    shade: 0.2,
    shadow: 0.46,
    vignette: 0.42,
    water: [0.4, 0.48, 0.48],
    moon: 0,
    moonFloor: 0.3,
    sheenFloor: 0.35,
    mist: 0.04,
    depth: 0.8,
    posterize: 16,
    posterMix: 0.55,
    paperMix: 0.3,
    paperLift: 0.22,
    grain: 0.014,
  },
};

const clone3 = (v: Vec3): Vec3 => [v[0], v[1], v[2]];

function cloneBase(b: LookBase): LookBase {
  return {
    ...b,
    tint: clone3(b.tint),
    causticTint: clone3(b.causticTint),
    glintColor: clone3(b.glintColor),
    sky: clone3(b.sky),
    water: clone3(b.water),
  };
}

export function lookFor(weather: Weather, night: boolean, rain = 0.5, snow = 0.5): Look {
  const l: Look = {
    ...cloneBase(LOOKS[weather] ?? LOOKS.sunny),
    sun: [-0.45, 0.45, 0.77],
    moonDisc: [0, 0, 1, 0],
    causticCell: 80,
    cloudWind: [0, 0],
    shadowDir: [0.7, 0.72],
    snowCover: 0,
    wetCover: 0,
    rainK: 0,
    flash: 0,
  };
  if (weather === "rain")
    Object.assign(l, {
      bright: 0.86 - 0.12 * rain,
      sat: 0.68 - 0.04 * rain,
      wave: 0.6 + 0.35 * rain * rain,
      ripple: 9 + 1.5 * rain,
      rippleDamp: 0.994 - 0.013 * rain,
      skyK: 0.075 + 0.045 * rain,
      mist: 0.03 + 0.05 * rain,
      caustic: 0.1 - 0.04 * rain,
      cloudCover: 0.78 + 0.22 * rain * rain,
      causticCell: 150,
    });
  if (weather === "snow")
    Object.assign(l, {
      bright: 0.96 + 0.05 * snow,
      sat: 0.66 - 0.12 * snow,
      cloudCover: 0.6 + 0.4 * snow,
      skyK: 0.08 + 0.09 * snow,
      caustic: 0.07 * (1 - snow * 0.6),
      wave: 0.5 - 0.12 * snow,
      mist: 0.02 + 0.06 * snow,
    });
  if (night)
    Object.assign(l, {
      sunK: l.sunK * 0.45,
      bright: l.bright * 0.48,
      sat: l.sat * 0.88,
      tint: [0.64, 0.8, 1.14] as Vec3,
      caustic: l.caustic * 0.25,
      glint: 0.55,
      glintColor: [0.7, 0.82, 1] as Vec3,
      sky: [0.22, 0.3, 0.44] as Vec3,
      skyK: l.skyK * 1.3 + 0.04,
      wave: l.wave * 1.1,
      shadow: l.shadow * 0.35,
      cloudShade: l.cloudShade * 0.5,
      moon: 1,
      water: [0.2, 0.3, 0.36] as Vec3,
      mist: l.mist * 0.6,
      paperMix: l.paperMix * 1.15,
      grain: l.grain * 0.6,
    });
  return l;
}

export function lerpLook(a: Look, b: Look, t: number): void {
  for (const key of Object.keys(b) as (keyof Look)[]) {
    const av = a[key] as unknown;
    const bv = b[key] as unknown;
    if (Array.isArray(av) && Array.isArray(bv)) {
      for (let i = 0; i < bv.length; i++) av[i] += (bv[i] - av[i]) * t;
    } else if (typeof av === "number" && typeof bv === "number") {
      (a[key] as number) = av + (bv - av) * t;
    }
  }
}

export const absorption = (col: number): Vec3 => [
  1 - col * (1 - DEEP_TINT[0]),
  1 - col * (1 - DEEP_TINT[1]),
  1 + col * (DEEP_TINT[2] - 1),
];
