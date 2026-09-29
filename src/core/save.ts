import { createFish } from "./fish.ts";
import { clamp, randomSeed } from "./math.ts";
import { PALETTES } from "./palette.ts";
import type {
  DailyCount,
  FishMark,
  GeoLocation,
  SanitizedSave,
  Settings,
  StoredFish,
} from "./types.ts";

const MARK_COLOR = /^#[0-9a-f]{6}$/i;

const WEATHER = ["sunny", "cloudy", "rain", "snow"];
const QUALITY = ["high", "eco"];
const WATER_TYPE = ["stream", "spring", "cascade", "lapping", "bamboo"];
const MUSIC = ["guqin", "bowl", "chimes", "off"];
const BOOL_KEYS = [
  "turtles",
  "crabs",
  "silverCarp",
  "butterflies",
  "names",
  "autoWeather",
  "night",
  "water",
  "weatherSound",
  "sfx",
] as const;
const UNIT_KEYS = [
  "waterVol",
  "weatherVol",
  "musicVol",
  "volume",
  "rainAmount",
  "snowAmount",
] as const;

function sanitizeSettings(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== "object") return {};
  const s = raw as Record<string, unknown>;
  const out: Partial<Settings> = {};
  if (WEATHER.includes(s.weather as string)) out.weather = s.weather as Settings["weather"];
  if (QUALITY.includes(s.quality as string)) out.quality = s.quality as Settings["quality"];
  if (WATER_TYPE.includes(s.waterType as string))
    out.waterType = s.waterType as Settings["waterType"];
  if (MUSIC.includes(s.music as string)) out.music = s.music as Settings["music"];
  if (Number.isFinite(s.speed as number)) out.speed = clamp(s.speed as number, 0.3, 2);
  for (const k of BOOL_KEYS)
    if (typeof s[k] === "boolean") (out as Record<string, boolean>)[k] = s[k] as boolean;
  for (const k of UNIT_KEYS)
    if (Number.isFinite(s[k] as number))
      (out as Record<string, number>)[k] = clamp(s[k] as number, 0, 1);
  if (
    s.location &&
    typeof s.location === "object" &&
    typeof (s.location as GeoLocation).name === "string" &&
    Number.isFinite((s.location as GeoLocation).latitude) &&
    Number.isFinite((s.location as GeoLocation).longitude)
  )
    out.location = {
      name: (s.location as GeoLocation).name.slice(0, 80),
      latitude: (s.location as GeoLocation).latitude,
      longitude: (s.location as GeoLocation).longitude,
    };
  return out;
}

function sanitizeMarks(raw: unknown): FishMark[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 400)
    .filter(
      (m): m is Record<string, unknown> =>
        !!m &&
        typeof m === "object" &&
        Number.isFinite((m as FishMark).x) &&
        Number.isFinite((m as FishMark).y) &&
        Number.isFinite((m as FishMark).r) &&
        MARK_COLOR.test(String((m as FishMark).color)),
    )
    .map((m) => ({
      x: clamp(Number(m.x), -32, 32),
      y: clamp(Number(m.y), -16, 16),
      r: clamp(Number(m.r), 1, 8),
      color: String(m.color),
    }));
}

function sanitizeDaily(raw: unknown): DailyCount | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  if (typeof d.date !== "string") return undefined;
  return { date: d.date, count: clamp(Math.floor(Number(d.count) || 0), 0, 999999) };
}

export function sanitizeSave(data: unknown): SanitizedSave | null {
  if (!data || typeof data !== "object") return null;
  const src = data as { fish?: unknown; settings?: unknown; daily?: unknown };
  if (!Array.isArray(src.fish) || src.fish.length === 0) return null;

  const fish: StoredFish[] = src.fish
    .slice(0, 60)
    .filter(
      (raw): raw is Record<string, unknown> =>
        !!raw && typeof raw === "object" && typeof (raw as { name?: unknown }).name === "string",
    )
    .map((f, i) => {
      const defaults = createFish(i, randomSeed(i + 8));
      return {
        id: typeof f.id === "string" ? f.id.slice(0, 80) : defaults.id,
        name: (f.name as string).trim().slice(0, 12) || defaults.name,
        palette: Number.isInteger(f.palette)
          ? clamp(f.palette as number, 0, PALETTES.length - 1)
          : 0,
        size: clamp(Number(f.size) || 0.8, 0.45, 1.5),
        seed: Number.isFinite(f.seed as number) ? (f.seed as number) : defaults.seed,
        eaten: clamp(Math.floor(Number(f.eaten) || 0), 0, 9999999),
        marks: sanitizeMarks(f.marks),
      };
    });

  if (fish.length === 0) return null;
  const settings = sanitizeSettings(src.settings);
  const daily = sanitizeDaily(src.daily);
  return daily ? { fish, settings, daily } : { fish, settings };
}
