import { TAU } from "../core/index.ts";

const MONTH = 29.530588853;
const NAMES = ["新月", "蛾眉月", "上弦月", "盈凸月", "满月", "亏凸月", "下弦月", "残月"];

export { MONTH };

export interface MoonPhase {
  age: number;
  angle: number;
  illum: number;
  name: string;
}

export function moonPhase(date: Date = new Date()): MoonPhase {
  const age = ((((date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % MONTH) + MONTH) % MONTH;
  const angle = (age / MONTH) * TAU;
  return {
    age,
    angle,
    illum: (1 - Math.cos(angle)) / 2,
    name: NAMES[Math.round((age / MONTH) * 8) % 8]!,
  };
}
