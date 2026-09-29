import { describe, it, expect } from "vite-plus/test";
import { DEFAULT_SETTINGS } from "../src/core/index.ts";
import type { Settings } from "../src/core/types.ts";
import { fetchCurrent, mapCurrent, searchCity, WeatherSync } from "../src/data/weather.ts";
import type { CurrentWeather, WeatherMapping } from "../src/data/weather.ts";

const response = (body: unknown, ok = true): Response =>
  ({ ok, json: () => Promise.resolve(body) }) as unknown as Response;

const fakeFetch = (body: unknown, ok = true): typeof fetch =>
  (() => Promise.resolve(response(body, ok))) as unknown as typeof fetch;

describe("mapCurrent", () => {
  it("maps a rainy code and derives rain amount from precipitation", () => {
    const m = mapCurrent({ temperature: 18, code: 61, wind: 5, precipitation: 4, snowfall: 0 });
    expect(m.weather).toBe("rain");
    expect(m.rainAmount).toBeCloseTo(0.65, 6);
    expect(m.snowAmount).toBeUndefined();
  });
  it("maps a snowy code and derives snow amount from snowfall", () => {
    const m = mapCurrent({ temperature: -2, code: 71, wind: 5, precipitation: 0, snowfall: 1.5 });
    expect(m.weather).toBe("snow");
    expect(m.snowAmount).toBeCloseTo(1, 6);
  });
  it("leaves amounts untouched for clear sky or missing precipitation", () => {
    expect(
      mapCurrent({ temperature: 25, code: 0, wind: 3, precipitation: 0, snowfall: 0 }).weather,
    ).toBe("sunny");
    const m = mapCurrent({ temperature: 18, code: 61, wind: 5, precipitation: NaN, snowfall: 0 });
    expect(m.rainAmount).toBeUndefined();
  });
});

describe("searchCity", () => {
  it("returns clamped, trimmed places", async () => {
    const places = await searchCity(
      "hang",
      new AbortController().signal,
      fakeFetch({
        results: [
          { name: "杭州", latitude: 30.2, longitude: 120.1 },
          { name: "x".repeat(100), latitude: 200, longitude: -999 },
          { name: 42 },
        ],
      }),
    );
    expect(places).toHaveLength(2);
    expect(places[0]).toEqual({ name: "杭州", latitude: 30.2, longitude: 120.1 });
    expect(places[1].name).toHaveLength(80);
    expect(places[1].latitude).toBe(90);
    expect(places[1].longitude).toBe(-180);
  });
  it("returns empty when there are no results and throws on network failure", async () => {
    expect(await searchCity("zzz", new AbortController().signal, fakeFetch({}))).toEqual([]);
    await expect(
      searchCity("zzz", new AbortController().signal, fakeFetch({}, false)),
    ).rejects.toThrow();
  });
});

describe("fetchCurrent", () => {
  it("reads the current block and defaults missing optional fields", async () => {
    const c = await fetchCurrent(
      { name: "杭州", latitude: 30, longitude: 120 },
      new AbortController().signal,
      fakeFetch({ current: { temperature_2m: 21.4, weather_code: 3, wind_speed_10m: 9 } }),
    );
    expect(c).toEqual({ temperature: 21.4, code: 3, wind: 9, precipitation: 0, snowfall: 0 });
  });
  it("rejects a payload without a usable temperature or code", async () => {
    await expect(
      fetchCurrent(
        { name: "x", latitude: 0, longitude: 0 },
        new AbortController().signal,
        fakeFetch({ current: { weather_code: 3 } }),
      ),
    ).rejects.toThrow();
  });
});

describe("WeatherSync", () => {
  const makeSettings = (): Settings => ({ ...DEFAULT_SETTINGS });

  it("does nothing when auto weather is off", async () => {
    const applied: WeatherMapping[] = [];
    const sync = new WeatherSync(
      makeSettings(),
      (m) => applied.push(m),
      fakeFetch({ current: {} }),
    );
    expect(await sync.refresh()).toBe(false);
    expect(applied).toEqual([]);
  });

  it("applies the mapped weather when on", async () => {
    const settings = makeSettings();
    settings.autoWeather = true;
    settings.location = { name: "杭州", latitude: 30, longitude: 120 };
    const applied: WeatherMapping[] = [];
    const sync = new WeatherSync(
      settings,
      (m) => applied.push(m),
      fakeFetch({ current: { temperature_2m: 18, weather_code: 61, precipitation: 4 } }),
    );
    expect(await sync.refresh()).toBe(true);
    expect(sync.current?.temperature).toBe(18);
    expect(applied).toEqual([{ weather: "rain", rainAmount: 0.65 }]);
  });

  it("discards a response that lost the race to a newer request", async () => {
    const settings = makeSettings();
    settings.autoWeather = true;
    settings.location = { name: "杭州", latitude: 30, longitude: 120 };
    const applied: WeatherMapping[] = [];
    let releaseFirst: ((c: CurrentWeather) => void) | null = null;
    let first = true;
    const fetchImpl = (() => {
      if (first) {
        first = false;
        return new Promise<Response>((res) => {
          releaseFirst = () => res(response({ current: { temperature_2m: 1, weather_code: 0 } }));
        });
      }
      return Promise.resolve(response({ current: { temperature_2m: 20, weather_code: 61 } }));
    }) as unknown as typeof fetch;
    const sync = new WeatherSync(settings, (m) => applied.push(m), fetchImpl);
    const stale = sync.refresh();
    const fresh = sync.refresh();
    expect(await fresh).toBe(true);
    const release = releaseFirst as ((c: CurrentWeather) => void) | null;
    release?.({ temperature: 1, code: 0, wind: 0, precipitation: 0, snowfall: 0 });
    expect(await stale).toBe(false);
    expect(applied).toEqual([{ weather: "rain", rainAmount: 0.15 }]);
  });
});
