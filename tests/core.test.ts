import { describe, it, expect } from "vite-plus/test";
import {
  PondSimulation,
  createFish,
  createSilverCarpShoal,
  randomSeed,
  weatherFromCode,
  sanitizeSave,
  fishPose,
  BODY,
  PALETTES,
  type Fish,
} from "../src/core/index.ts";

describe("PondSimulation 投喂", () => {
  it("锦鲤会追逐并吃掉鱼食，每颗只记一次", () => {
    const random = randomSeed(2);
    const fish = createFish(0, random);
    fish.x = 0.5;
    fish.y = 0.5;
    fish.angle = 0;
    const pond = new PondSimulation([fish], 1000, 700, random);
    pond.feed(610, 350, 8);
    for (let i = 0; i < 1200; i++) pond.step(1 / 60);
    expect(pond.food.length).toBe(0);
    expect(fish.eaten).toBe(8);
    expect(pond.totalEaten).toBe(8);
  });

  it("鱼食落在各处都能被吃完，包括正好落在鱼身下方", () => {
    for (let t = 0; t < 40; t++) {
      const random = randomSeed(t * 7 + 1);
      const fish = createFish(0, random);
      fish.x = 0.2 + random() * 0.6;
      fish.y = 0.2 + random() * 0.6;
      fish.angle = random() * 6.28;
      const pond = new PondSimulation([fish], 1200, 800, random);
      pond.scale = 1.1;
      pond.feed(200 + random() * 800, 150 + random() * 500, 9);
      for (let i = 0; i < 60 * 24 && pond.food.length; i++) pond.step(1 / 60);
      expect(fish.eaten, `第 ${t} 组没有吃完`).toBe(9);
    }
  });

  it("食物有数量上限并会过期", () => {
    const pond = new PondSimulation([], 1000, 700, randomSeed(2));
    for (let i = 0; i < 40; i++) pond.feed(500, 300);
    expect(pond.food.length).toBe(180);
    expect(pond.feed(500, 300)).toBe(false);
    for (let i = 0; i < 600; i++) pond.step(0.05);
    expect(pond.food.length).toBe(0);
  });
});

describe("游动稳定性", () => {
  it("长时间游动保持边界与数值稳定", () => {
    const random = randomSeed(4);
    const fish = Array.from({ length: 24 }, (_, i) => createFish(i, random));
    const pond = new PondSimulation(fish, 390, 844, random);
    for (let i = 0; i < 5000; i++) pond.step(0.04);
    for (const f of fish) {
      expect(f.x).toBeGreaterThanOrEqual(0.03);
      expect(f.x).toBeLessThanOrEqual(0.97);
      expect(f.y).toBeGreaterThanOrEqual(0.035);
      expect(f.y).toBeLessThanOrEqual(0.965);
      expect(Number.isFinite(f.angle)).toBe(true);
    }
  });

  it("游动姿态沿脊柱弯曲，数值有限且体长基本不变", () => {
    const random = randomSeed(9);
    const fish = Array.from({ length: 12 }, (_, i) => createFish(i, random));
    const pond = new PondSimulation(fish, 1000, 700, random);
    for (let i = 0; i < 900; i++) pond.step(1 / 60);
    for (const f of fish) {
      const s = f.size * pond.scale;
      const pose = fishPose(f, s);
      let len = 0;
      expect(pose.every(Number.isFinite)).toBe(true);
      for (let i = 1; i <= BODY.segments; i++)
        len += Math.hypot(pose[i * 4] - pose[i * 4 - 4], pose[i * 4 + 1] - pose[i * 4 - 3]);
      expect(Math.abs(len / (BODY.length * s) - 1)).toBeLessThan(0.12);
    }
  });

  it("锦鲤绕开荷叶丛", () => {
    const random = randomSeed(11);
    const fish = Array.from({ length: 16 }, (_, i) => createFish(i, random));
    const pond = new PondSimulation(fish, 1200, 800, random);
    pond.obstacles = [{ x: 600, y: 400, r: 140 }];
    let inside = 0;
    let samples = 0;
    for (let i = 0; i < 60 * 60; i++) {
      pond.step(1 / 60);
      if (i > 300 && i % 10 === 0)
        for (const f of fish) {
          samples++;
          if (Math.hypot(f.x * 1200 - 600, f.y * 800 - 400) < 140) inside++;
        }
    }
    expect(inside / samples).toBeLessThan(0.03);
  });
});

describe("惊鱼", () => {
  it("观鱼模式轻点水面，附近的鱼会受惊游开", () => {
    const random = randomSeed(5);
    const fish = createFish(0, random);
    fish.x = 0.5;
    fish.y = 0.5;
    fish.angle = 0;
    const pond = new PondSimulation([fish], 1000, 700, random);
    pond.step(1 / 60);
    pond.scare(520, 350);
    expect(fish.flee).toBeGreaterThan(0);
    for (let i = 0; i < 45; i++) pond.step(1 / 60);
    expect(Math.hypot(fish.x * 1000 - 520, fish.y * 700 - 350)).toBeGreaterThan(60);
  });
});

describe("weatherFromCode", () => {
  it("天气代码正确区分晴、阴、雨、雪", () => {
    for (const c of [0, 1]) expect(weatherFromCode(c)).toBe("sunny");
    for (const c of [2, 3, 45, 48]) expect(weatherFromCode(c)).toBe("cloudy");
    for (const c of [51, 63, 80, 95]) expect(weatherFromCode(c)).toBe("rain");
    for (const c of [71, 73, 75, 77, 85, 86]) expect(weatherFromCode(c)).toBe("snow");
  });
});

describe("sanitizeSave", () => {
  it("读取存档时限制异常数据，保留用户命名和记录", () => {
    expect(sanitizeSave(null)).toBeNull();
    expect(sanitizeSave({ fish: [] })).toBeNull();
    const saved = sanitizeSave({
      fish: [{ name: "小满", palette: 999, size: -8, eaten: 37, seed: 42 }],
    })!;
    expect(saved.fish[0]!.name).toBe("小满");
    expect(saved.fish[0]!.eaten).toBe(37);
    expect(saved.fish[0]!.palette).toBe(PALETTES.length - 1);
    expect(saved.fish[0]!.size).toBe(0.45);
    expect(
      sanitizeSave({ fish: Array.from({ length: 100 }, () => ({ name: "鱼" })) })!.fish.length,
    ).toBe(60);
  });

  it("皮肤绑定只保留合法档位与物种，皮肤 id 被截断", () => {
    const saved = sanitizeSave({
      fish: [{ name: "小满" }],
      skinBindings: {
        "pond-1": {
          default: { koi: "skin-1", goldfish: "x" },
          autumn: { silvercarp: "s2".padEnd(300, "0") },
          night: { koi: "skin-3" },
        },
        "pond-2": "bogus",
      },
    })!;
    expect(saved.skinBindings).toEqual({
      "pond-1": {
        default: { koi: "skin-1" },
        autumn: { silvercarp: "s2" + "0".repeat(198) },
      },
    });
    expect(
      sanitizeSave({ fish: [{ name: "小满" }], skinBindings: "bogus" })!.skinBindings,
    ).toBeUndefined();
  });

  it("手绘花纹经过存档清洗后保留，丢弃无效笔触", () => {
    const data = sanitizeSave({
      fish: [
        {
          name: "小花",
          marks: [
            { x: 10, y: 2, r: 3, color: "#bc5036" },
            { x: NaN, y: 2, r: 3, color: "#ffffff" },
            { x: 1, y: 1, r: 3, color: "invalid" },
          ],
        },
      ],
    })!;
    expect(data.fish[0]!.marks).toEqual([{ x: 10, y: 2, r: 3, color: "#bc5036" }]);
  });

  it("纯红花色能随旧存档往返，原有花色编号不变", () => {
    const red = PALETTES.findIndex((p) => p.kind === "benigoi");
    const saved = sanitizeSave(
      JSON.parse(
        JSON.stringify({
          fish: [
            { name: "朱砂", palette: red },
            { name: "墨墨", palette: 5 },
          ],
        }),
      ),
    )!;
    expect(saved.fish[0]!.palette).toBe(red);
    expect(PALETTES[saved.fish[1]!.palette]!.kind).toBe("karasu");
  });

  it("设置只接受合法取值，越界数值被夹紧，非法键被丢弃", () => {
    const saved = sanitizeSave({
      fish: [{ name: "小满" }],
      settings: {
        weather: "rain",
        quality: "cinematic",
        speed: 9,
        volume: 3,
        rainAmount: -1,
        caustic: "yes",
        causticAmount: -1,
        night: true,
        turtles: "yes",
        music: "guqin",
        waterType: "river",
        location: { name: "杭州", latitude: 30.2, longitude: 120.1 },
        bogus: 1,
      },
    })!;
    expect(saved.settings.weather).toBe("rain");
    expect(saved.settings.quality).toBeUndefined();
    expect(saved.settings.speed).toBe(2);
    expect(saved.settings.volume).toBe(1);
    expect(saved.settings.rainAmount).toBe(0);
    expect(saved.settings.caustic).toBeUndefined();
    expect(saved.settings.causticAmount).toBe(0);
    expect(saved.settings.night).toBe(true);
    expect(saved.settings.turtles).toBeUndefined();
    expect(saved.settings.music).toBe("guqin");
    expect(saved.settings.waterType).toBeUndefined();
    expect(saved.settings.location).toEqual({
      name: "杭州",
      latitude: 30.2,
      longitude: 120.1,
    });
    expect("bogus" in saved.settings).toBe(false);
  });

  it("极致档作为合法画质取值可往返", () => {
    const saved = sanitizeSave({ fish: [{ name: "小满" }], settings: { quality: "ultra" } })!;
    expect(saved.settings.quality).toBe("ultra");
  });

  it("焦散开关与强度合法取值可往返", () => {
    const saved = sanitizeSave({
      fish: [{ name: "小满" }],
      settings: { caustic: false, causticAmount: 0.5 },
    })!;
    expect(saved.settings.caustic).toBe(false);
    expect(saved.settings.causticAmount).toBe(0.5);
  });

  it("交互模式只接受喂鱼、惊扰、观鱼", () => {
    const saved = sanitizeSave({
      fish: [{ name: "小满" }],
      settings: { interaction: "startle" as never },
    })!;
    expect(saved.settings.interaction).toBe("startle");
    const dropped = sanitizeSave({
      fish: [{ name: "小满" }],
      settings: { interaction: "poke" as never },
    })!;
    expect(dropped.settings.interaction).toBeUndefined();
  });
});

describe("青鲢", () => {
  it("青鲢独立于锦鲤名额，混游稳定且不争抢投喂颗粒", () => {
    const random = randomSeed(38);
    const koi = createFish(0, random);
    const shoal = createSilverCarpShoal(random);
    const pond = new PondSimulation([koi], 1000, 700, random, shoal);
    expect(pond.allFish.length).toBe(5);
    expect(pond.fish.length).toBe(1);
    expect(shoal.length).toBe(4);
    pond.feed(600, 350, 9);
    for (let i = 0; i < 3600; i++) pond.step(1 / 60);
    expect(koi.eaten).toBe(9);
    for (const f of shoal) {
      expect(f.eaten).toBe(0);
      expect(fishPose(f, f.size).every(Number.isFinite)).toBe(true);
      expect(f.x).toBeGreaterThanOrEqual(0.03);
      expect(f.x).toBeLessThanOrEqual(0.97);
      expect(f.y).toBeGreaterThanOrEqual(0.035);
      expect(f.y).toBeLessThanOrEqual(0.965);
    }
    pond.scare(shoal[0]!.x * 1000, shoal[0]!.y * 700);
    expect(shoal[0]!.flee).toBeGreaterThan(0);
  });

  it("青鲢转向响应比锦鲤灵活，急转后脊柱仍连续稳定", () => {
    function turn(species?: "silvercarp") {
      const f: Fish = {
        ...createFish(0, () => 0.5),
        species,
        x: 0.5,
        y: 0.5,
        size: 1,
        speed: 1,
        angle: 0,
      };
      const pond = new PondSimulation([f], 4000, 3000, () => 1);
      pond.step(0);
      f.goal = { x: 0.5, y: 0.85 };
      f.goalTime = 100;
      f.depthGoal = f.depth;
      for (let i = 0; i < 30; i++) pond.step(1 / 60);
      return { f, pond };
    }
    const koi = turn(undefined);
    const carp = turn("silvercarp");
    expect(carp.f.angle).toBeGreaterThan(koi.f.angle * 1.4);
    const { f, pond } = carp;
    pond.scare(f.x * 4000 + 30, f.y * 3000);
    for (let t = 0; t < 600; t++) {
      pond.step(1 / 60);
      const pose = fishPose(f, 1);
      expect(pose.every(Number.isFinite)).toBe(true);
      let length = 0;
      for (let i = 1; i <= BODY.segments; i++)
        length += Math.hypot(pose[i * 4] - pose[i * 4 - 4], pose[i * 4 + 1] - pose[i * 4 - 3]);
      expect(Math.abs(length / BODY.length - 1)).toBeLessThan(0.15);
    }
  });
});
