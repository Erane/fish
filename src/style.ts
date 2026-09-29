export const TOKENS = {
  paper: "#f3f0e6",
  ink: "#29463e",
  line: "#d5d7c8",
  rust: "#b15f46",
  accent: "#304d42",
  panel: "#f6f4ea",
  shadow: "#e7e6d9",
  outline: "rgba(67,77,61,.58)",
} as const;

export interface FishShade {
  outline: string;
  outlineWidth: number;
  shadeLevels: readonly [number, number, number];
  sheen: { alpha: number; stops: readonly (readonly [number, number])[] };
}

export const FISH_SHADE: FishShade = {
  outline: "rgba(67,77,61,.58)",
  outlineWidth: 0.9,
  shadeLevels: [1.05, 1, 0.85],
  sheen: {
    alpha: 0.14,
    stops: [
      [0, 0],
      [0.38, 0.9],
      [0.62, 0.35],
      [1, 0],
    ],
  },
};

export interface Grade {
  posterize: number;
  posterMix: number;
  paperMix: number;
  paperLift: number;
  noise: number;
}

export const GRADE: Grade = {
  posterize: 12,
  posterMix: 0.45,
  paperMix: 0.22,
  paperLift: 0.18,
  noise: 0.018,
};

export function hexToRgb01(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}
