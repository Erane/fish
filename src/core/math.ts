export const TAU = Math.PI * 2;

export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

export const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function randomSeed(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
