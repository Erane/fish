import { describe, it, expect } from "vite-plus/test";
import { createFish, DEFAULT_SETTINGS, PondSimulation, randomSeed } from "../src/core/index.ts";
import type { Fish, Settings } from "../src/core/types.ts";
import { Store } from "../src/ui/store.ts";
import type { PersistSink } from "../src/ui/store.ts";

function makeStore(fishCount = 3): {
  store: Store;
  sim: PondSimulation;
  settings: Settings;
  sink: PersistSink & { calls: number };
  qualityRuns: { n: number };
} {
  const random = randomSeed(11);
  const fish = Array.from({ length: fishCount }, (_, i) => createFish(i, random));
  const sim = new PondSimulation(fish, 800, 600, random);
  const settings = { ...DEFAULT_SETTINGS } as Settings;
  const sink = { calls: 0, schedule(): void {} };
  sink.schedule = () => {
    sink.calls += 1;
  };
  const qualityRuns = { n: 0 };
  const store = new Store(sim, settings, sink, () => {
    qualityRuns.n += 1;
  });
  return { store, sim, settings, sink, qualityRuns };
}

describe("Store.set", () => {
  it("改动设置会写入并存盘", () => {
    const { store, settings, sink } = makeStore();
    store.set("weather", "rain");
    expect(settings.weather).toBe("rain");
    expect(sink.calls).toBe(1);
  });

  it("青鲢开关直接驱动仿真的 residentsOn", () => {
    const { store, sim } = makeStore();
    store.set("silverCarp", false);
    expect(sim.residentsOn).toBe(false);
    store.set("silverCarp", true);
    expect(sim.residentsOn).toBe(true);
  });

  it("画质变更触发重排回调", () => {
    const { store, qualityRuns } = makeStore();
    store.set("quality", "eco");
    expect(qualityRuns.n).toBe(1);
  });
});

describe("Store.addKoi", () => {
  it("按规格新增锦鲤，保留运行时字段", () => {
    const { store, sim } = makeStore(1);
    const ok = store.addKoi({
      name: "小满",
      palette: 2,
      size: 0.8,
      seed: 99,
      marks: [{ x: 4, y: 0, r: 3, color: "#df4935" }],
    });
    expect(ok).toBe(true);
    expect(sim.fish).toHaveLength(2);
    const f = sim.fish[1]!;
    expect(f.name).toBe("小满");
    expect(f.palette).toBe(2);
    expect(f.size).toBe(0.8);
    expect(f.seed).toBe(99);
    expect(f.marks).toHaveLength(1);
    expect(typeof f.x).toBe("number");
  });

  it("空名字回退到默认名", () => {
    const { store, sim } = makeStore(0);
    store.addKoi({ name: "   ", palette: 0, size: 0.7, seed: 1, marks: [] });
    expect(sim.fish[0]!.name.length).toBeGreaterThan(0);
  });

  it("超过 60 尾时拒绝新增", () => {
    const { store, sim } = makeStore(60);
    const ok = store.addKoi({ name: "多余", palette: 0, size: 0.7, seed: 1, marks: [] });
    expect(ok).toBe(false);
    expect(sim.fish).toHaveLength(60);
  });
});

describe("Store.releaseKoi", () => {
  it("放生移除指定锦鲤", () => {
    const { store, sim } = makeStore(3);
    const target: Fish = sim.fish[1]!;
    expect(store.releaseKoi(target)).toBe(true);
    expect(sim.fish).toHaveLength(2);
    expect(sim.fish).not.toContain(target);
  });

  it("至少保留一尾，最后一尾拒绝放生", () => {
    const { store, sim } = makeStore(1);
    expect(store.releaseKoi(sim.fish[0]!)).toBe(false);
    expect(sim.fish).toHaveLength(1);
  });
});

describe("Store.renameKoi", () => {
  it("改名去空白并截断到 12 字", () => {
    const { store, sim } = makeStore(1);
    const f = sim.fish[0]!;
    store.renameKoi(f, "  一二三四五六七八九十甲乙丙丁  ");
    expect(f.name).toBe("一二三四五六七八九十甲乙");
    expect(f.name).toHaveLength(12);
  });

  it("空名字保留原名", () => {
    const { store, sim } = makeStore(1);
    const f = sim.fish[0]!;
    const before = f.name;
    store.renameKoi(f, "   ");
    expect(f.name).toBe(before);
  });
});
