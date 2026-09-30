import { describe, expect, it } from "vite-plus/test";
import { BUILTIN_THEMES, seedBuiltinPacks } from "../src/data/builtinPacks.ts";
import type { SeedSink } from "../src/data/builtinPacks.ts";
import type { PondPack, Season } from "../src/core/pack.ts";

const AUTUMN_PACK = {
  format: 1,
  id: "autumn-garden-pond",
  name: "秋日园林池塘",
  style: "realistic",
  water: {
    polygon: [0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8],
    obstacles: [],
    anchors: { crabHomes: [], spots: [], buds: [] },
  },
  seasons: {
    autumn: { image: "autumn.png", tint: { water: "#2e6a72" } },
    winter: { image: "winter.png", tint: { water: "#6f8f96" } },
  },
};

const AUTUMN_THEME = { url: "theme/autumn.json", images: { autumn: "theme/autumn.png" } };

function fakeFetch(routes: Record<string, unknown>): {
  fetch: typeof fetch;
  urls: string[];
} {
  const urls: string[] = [];
  const fetchImpl = ((url: string) => {
    urls.push(url);
    const route = routes[url];
    if (route instanceof Error) return Promise.reject(route);
    if (route === undefined) return Promise.resolve({ ok: false } as Response);
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(route),
      blob: () => Promise.resolve(new Blob(["asset"])),
    } as unknown as Response);
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, urls };
}

interface FakeSink extends SeedSink {
  marked: string[];
  imported: { id: string; seasons: Season[] }[];
}

function makeSink(seededUrls: string[] = [], failImport = false): FakeSink {
  const sink: FakeSink = {
    marked: [],
    imported: [],
    seeded: () => Promise.resolve(seededUrls),
    mark: (url: string) => {
      sink.marked.push(url);
      return Promise.resolve();
    },
    importPack: (pack: PondPack, files: Partial<Record<Season, Blob>>) => {
      const seasons = Object.keys(files) as Season[];
      if (failImport || !seasons.length) return Promise.reject(new Error("seed failed"));
      sink.imported.push({ id: pack.id, seasons });
      return Promise.resolve(pack);
    },
  };
  return sink;
}

describe("BUILTIN_THEMES", () => {
  it("清单非空且每项都带主题 JSON 与季节底图", () => {
    expect(BUILTIN_THEMES.length).toBeGreaterThan(0);
    for (const theme of BUILTIN_THEMES) {
      expect(theme.url).toMatch(/\.json$/);
      expect(Object.keys(theme.images).length).toBeGreaterThan(0);
    }
  });
});

describe("seedBuiltinPacks", () => {
  it("首次播种：取 JSON 与清单季节底图、导入、记账并返回新包 id", async () => {
    const { fetch, urls } = fakeFetch({
      "theme/autumn.json": AUTUMN_PACK,
      "theme/autumn.png": "asset",
    });
    const sink = makeSink();
    expect(await seedBuiltinPacks([AUTUMN_THEME], fetch, sink)).toEqual(["autumn-garden-pond"]);
    expect(urls).toEqual(["theme/autumn.json", "theme/autumn.png"]);
    expect(sink.imported).toEqual([{ id: "autumn-garden-pond", seasons: ["autumn"] }]);
    expect(sink.marked).toEqual(["theme/autumn.json"]);
  });

  it("已播种过的主题整条跳过，删除后不复活", async () => {
    const { fetch, urls } = fakeFetch({
      "theme/autumn.json": AUTUMN_PACK,
      "theme/autumn.png": "asset",
    });
    const sink = makeSink(["theme/autumn.json"]);
    expect(await seedBuiltinPacks([AUTUMN_THEME], fetch, sink)).toEqual([]);
    expect(urls).toEqual([]);
    expect(sink.imported).toEqual([]);
  });

  it("清单没有给图的季节不播种", async () => {
    const { fetch } = fakeFetch({
      "theme/autumn.json": AUTUMN_PACK,
      "theme/autumn.png": "asset",
    });
    const sink = makeSink();
    await seedBuiltinPacks([AUTUMN_THEME], fetch, sink);
    expect(sink.imported[0]!.seasons).toEqual(["autumn"]);
  });

  it("JSON 非法：不导入、不记账", async () => {
    const { fetch } = fakeFetch({ "theme/autumn.json": { format: 1, id: "x" } });
    const sink = makeSink();
    expect(await seedBuiltinPacks([AUTUMN_THEME], fetch, sink)).toEqual([]);
    expect(sink.imported).toEqual([]);
    expect(sink.marked).toEqual([]);
  });

  it("底图取不到：不导入、不记账，下次启动重试", async () => {
    const { fetch } = fakeFetch({ "theme/autumn.json": AUTUMN_PACK });
    const sink = makeSink();
    expect(await seedBuiltinPacks([AUTUMN_THEME], fetch, sink)).toEqual([]);
    expect(sink.marked).toEqual([]);
  });

  it("导入失败：不记账", async () => {
    const { fetch } = fakeFetch({
      "theme/autumn.json": AUTUMN_PACK,
      "theme/autumn.png": "asset",
    });
    const sink = makeSink([], true);
    expect(await seedBuiltinPacks([AUTUMN_THEME], fetch, sink)).toEqual([]);
    expect(sink.marked).toEqual([]);
  });

  it("取数抛错不阻塞：坏主题跳过，好主题照常播种", async () => {
    const { fetch } = fakeFetch({
      "theme/broken.json": new Error("network"),
      "theme/autumn.json": AUTUMN_PACK,
      "theme/autumn.png": "asset",
    });
    const sink = makeSink();
    const ids = await seedBuiltinPacks(
      [{ url: "theme/broken.json", images: { autumn: "theme/autumn.png" } }, AUTUMN_THEME],
      fetch,
      sink,
    );
    expect(ids).toEqual(["autumn-garden-pond"]);
    expect(sink.marked).toEqual(["theme/autumn.json"]);
  });
});
