import type { Weather } from "./types.ts";

const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

export function weatherFromCode(code: number): Weather {
  if (SNOW_CODES.has(code)) return "snow";
  if (code >= 51) return "rain";
  if (code >= 2) return "cloudy";
  return "sunny";
}
