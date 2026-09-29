import { clamp, weatherFromCode } from "../core/index.ts";
import type { GeoLocation, Settings, Weather } from "../core/types.ts";

export interface CurrentWeather {
  temperature: number;
  code: number;
  wind: number;
  precipitation: number;
  snowfall: number;
}

export interface WeatherMapping {
  weather: Weather;
  rainAmount?: number;
  snowAmount?: number;
}

const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT = 12000;

export function mapCurrent(c: CurrentWeather): WeatherMapping {
  const weather = weatherFromCode(c.code);
  const out: WeatherMapping = { weather };
  if (weather === "rain" && Number.isFinite(c.precipitation))
    out.rainAmount = clamp(0.15 + c.precipitation / 8, 0.15, 1);
  if (weather === "snow" && Number.isFinite(c.snowfall))
    out.snowAmount = clamp(0.2 + c.snowfall / 1.5, 0.2, 1);
  return out;
}

export async function searchCity(
  query: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<GeoLocation[]> {
  const response = await fetchImpl(
    `${GEOCODING}?name=${encodeURIComponent(query)}&count=5&language=zh&format=json`,
    { signal },
  );
  if (!response.ok) throw new Error("network");
  const data = (await response.json()) as { results?: unknown };
  if (!Array.isArray(data.results)) return [];
  return data.results
    .filter(
      (r): r is Record<string, unknown> =>
        !!r &&
        typeof r === "object" &&
        typeof (r as GeoLocation).name === "string" &&
        Number.isFinite((r as GeoLocation).latitude) &&
        Number.isFinite((r as GeoLocation).longitude),
    )
    .map((r) => ({
      name: (r.name as string).slice(0, 80),
      latitude: clamp(r.latitude as number, -90, 90),
      longitude: clamp(r.longitude as number, -180, 180),
    }));
}

export async function fetchCurrent(
  loc: GeoLocation,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<CurrentWeather> {
  const response = await fetchImpl(
    `${FORECAST}?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,wind_speed_10m,precipitation,snowfall&timezone=auto`,
    { signal },
  );
  if (!response.ok) throw new Error("network");
  const data = (await response.json()) as { current?: Record<string, unknown> };
  const c = data.current;
  if (
    !c ||
    !Number.isFinite(c.temperature_2m as number) ||
    !Number.isFinite(c.weather_code as number)
  )
    throw new Error("data");
  const num = (v: unknown): number => (Number.isFinite(v as number) ? (v as number) : 0);
  return {
    temperature: c.temperature_2m as number,
    code: c.weather_code as number,
    wind: num(c.wind_speed_10m),
    precipitation: num(c.precipitation),
    snowfall: num(c.snowfall),
  };
}

export class WeatherSync {
  current: CurrentWeather | null = null;
  private timer = 0;
  private request = 0;
  private readonly settings: Settings;
  private readonly onApply: (mapping: WeatherMapping) => void;
  private readonly fetchImpl: typeof fetch;

  constructor(
    settings: Settings,
    onApply: (mapping: WeatherMapping) => void,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.settings = settings;
    this.onApply = onApply;
    this.fetchImpl = fetchImpl;
  }

  start(): void {
    this.timer = setInterval(
      () => {
        void this.refresh();
      },
      15 * 60 * 1000,
    );
    if (this.settings.autoWeather && this.settings.location) void this.refresh();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = 0;
  }

  search(query: string, signal: AbortSignal): Promise<GeoLocation[]> {
    return searchCity(query, signal, this.fetchImpl);
  }

  async refresh(): Promise<boolean> {
    const loc = this.settings.location;
    if (!this.settings.autoWeather || !loc) return false;
    const id = ++this.request;
    try {
      const c = await fetchCurrent(loc, AbortSignal.timeout(TIMEOUT), this.fetchImpl);
      if (id !== this.request || !this.settings.autoWeather) return false;
      this.current = c;
      this.onApply(mapCurrent(c));
      return true;
    } catch {
      return false;
    }
  }
}
