import { describe, expect, it } from "vite-plus/test";
import {
  loadBuiltinThemes,
  parseThemeManifest,
  seedBuiltinPacks,
} from "../src/data/builtinPacks.ts";
import type { BuiltinTheme, SeedSink } from "../src/data/builtinPacks.ts";
import type { SeededTheme } from "../src/data/db.ts";
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

const AUTUMN_THEME: BuiltinTheme = {
  url: "theme/autumn.json",
  images: { autumn: "theme/autumn.png" },
};

const AUTUMN_MARK: SeededTheme = { url: AUTUMN_THEME.url, id: "autumn-garden-pond" };

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
  marked: SeededTheme[];
  removed: SeededTheme[];
  imported: { id: string; seasons: Season[] }[];
}

function makeSink(
  seeded: SeededTheme[] = [],
  fail: { import?: boolean; remove?: boolean } = {},
): FakeSink {
  const sink: FakeSink = {
    marked: [],
    removed: [],
    imported: [],
    seeded: () => Promise.resolve(seeded),
    mark: (mark) => {
      sink.marked.push(mark);
      return Promise.resolve();
    },
    remove: (mark) => {
      if (fail.remove) return Promise.reject(new Error("remove failed"));
      sink.removed.push(mark);
      return Promise.resolve();
    },
    importPack: (pack: PondPack, files: Partial<Record<Season, Blob>>) => {
      const seasons = Object.keys(files) as Season[];
      if (fail.import || !seasons.length) return Promise.reject(new Error("seed failed"));
      sink.imported.push({ id: pack.id, seasons });
      return Promise.resolve(pack);
    },
  };
  return sink;
}

describe("parseThemeManifest", () => {
  it("合法条目原样保留", () => {
    expect(parseThemeManifest({ themes: [AUTUMN_THEME] })).toEqual([AUTUMN_THEME]);
  });

  it("缺 url、缺底图、非对象的条目整条丢弃", () => {
    expect(
      parseThemeManifest({
        themes: [null, { images: { autumn: "a.png" } }, { url: "t.json" }, AUTUMN_THEME],
      }),
    ).toEqual([AUTUMN_THEME]);
  });

  it("未知季节的底图丢弃，没有有效底图的条目整条丢弃", () => {
    expect(
      parseThemeManifest({
        themes: [
          { url: "t.json", images: { festival: "x.png", autumn: "a.png" } },
          { url: "u.json", images: { festival: "x.png" } },
        ],
      }),
    ).toEqual([{ url: "t.json", images: { autumn: "a.png" } }]);
  });

  it("根结构不是清单则返回 null，表示配置状态未知", () => {
    expect(parseThemeManifest(null)).toBeNull();
    expect(parseThemeManifest({})).toBeNull();
    expect(parseThemeManifest({ themes: "x" })).toBeNull();
  });

  it("合法但为空的清单返回空数组", () => {
    expect(parseThemeManifest({ themes: [] })).toEqual([]);
  });
});

describe("loadBuiltinThemes", () => {
  it("从固定清单地址拉取并解析", async () => {
    const { fetch, urls } = fakeFetch({ "theme/themes.json": { themes: [AUTUMN_THEME] } });
    expect(await loadBuiltinThemes(fetch)).toEqual([AUTUMN_THEME]);
    expect(urls).toEqual(["theme/themes.json"]);
  });

  it("拉取失败、响应非 2xx 或结构非法：返回 null 表示状态未知", async () => {
    expect(
      await loadBuiltinThemes(fakeFetch({ "theme/themes.json": new Error("network") }).fetch),
    ).toBeNull();
    expect(await loadBuiltinThemes(fakeFetch({}).fetch)).toBeNull();
    expect(
      await loadBuiltinThemes(fakeFetch({ "theme/themes.json": "not-a-manifest" }).fetch),
    ).toBeNull();
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
    expect(sink.marked).toEqual([AUTUMN_MARK]);
  });

  it("已播种过的主题整条跳过，删除后不复活", async () => {
    const { fetch, urls } = fakeFetch({
      "theme/autumn.json": AUTUMN_PACK,
      "theme/autumn.png": "asset",
    });
    const sink = makeSink([AUTUMN_MARK]);
    expect(await seedBuiltinPacks([AUTUMN_THEME], fetch, sink)).toEqual([]);
    expect(urls).toEqual([]);
    expect(sink.imported).toEqual([]);
    expect(sink.removed).toEqual([]);
  });

  it("清单外已播种主题被回收，清单内的照常保留", async () => {
    const { fetch, urls } = fakeFetch({
      "theme/autumn.json": AUTUMN_PACK,
      "theme/autumn.png": "asset",
    });
    const sink = makeSink([AUTUMN_MARK, { url: "theme/winter.json", id: "winter-pond" }]);
    expect(await seedBuiltinPacks([AUTUMN_THEME], fetch, sink)).toEqual([]);
    expect(sink.removed).toEqual([{ url: "theme/winter.json", id: "winter-pond" }]);
    expect(sink.imported).toEqual([]);
    expect(urls).toEqual([]);
  });

  it("被回收的主题下次上架可重新播种", async () => {
    const { fetch } = fakeFetch({
      "theme/autumn.json": AUTUMN_PACK,
      "theme/autumn.png": "asset",
    });
    const sink = makeSink([{ url: "theme/winter.json", id: "winter-pond" }]);
    expect(await seedBuiltinPacks([AUTUMN_THEME], fetch, sink)).toEqual(["autumn-garden-pond"]);
    expect(sink.removed).toEqual([{ url: "theme/winter.json", id: "winter-pond" }]);
    expect(sink.marked).toEqual([AUTUMN_MARK]);
  });

  it("回收失败不阻塞本次播种", async () => {
    const { fetch } = fakeFetch({
      "theme/autumn.json": AUTUMN_PACK,
      "theme/autumn.png": "asset",
    });
    const sink = makeSink([{ url: "theme/winter.json", id: "winter-pond" }], { remove: true });
    expect(await seedBuiltinPacks([AUTUMN_THEME], fetch, sink)).toEqual(["autumn-garden-pond"]);
    expect(sink.marked).toEqual([AUTUMN_MARK]);
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
    const sink = makeSink([], { import: true });
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
    expect(sink.marked).toEqual([AUTUMN_MARK]);
  });
});
