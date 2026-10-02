import { describe, it, expect } from "vite-plus/test";
import { finSpread } from "../src/scene/scene.ts";
import {
  PondSimulation,
  createFish,
  createSilverCarpShoal,
  randomSeed,
  weatherFromCode,
  sanitizeSave,
  fishPose,
  spineGap,
  temperOf,
  updateSpine,
  BODY,
  PALETTES,
  type Fish,
  type Temper,
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

  it("角落里的鱼被惊扰时逃离方向偏向开阔处，而不是顶进墙角", () => {
    const random = randomSeed(11);
    const fish = createFish(0, random);
    fish.x = 970 / 1200;
    fish.y = 620 / 800;
    fish.angle = Math.PI / 4;
    const pond = new PondSimulation([fish], 1200, 800, random);
    pond.boundary = [200, 150, 1000, 150, 1000, 650, 200, 650];
    const reach = BODY.length * fish.size * pond.scale;
    const probeQ = (a: number): number => {
      let q = Infinity;
      for (const r of [0.5, 1.1]) {
        const v = pond.field.clearance(
          970 + Math.cos(a) * reach * r,
          620 + Math.sin(a) * reach * r,
        );
        if (v < q) q = v;
      }
      return q;
    };
    const raw = Math.atan2(620 - 400, 970 - 600);
    pond.scare(600, 400, 500);
    expect(fish.flee).toBeGreaterThan(0);
    expect(probeQ(fish.fleeAngle)).toBeGreaterThan(probeQ(raw));
  });
});

describe("受困自救", () => {
  it("位移停滞的鱼触发自救，窜向最开阔的水域", () => {
    const random = randomSeed(3);
    const fish = createFish(0, random);
    fish.x = 0.5;
    fish.y = 0.5;
    fish.checkX = 0.5;
    fish.checkY = 0.5;
    const pond = new PondSimulation([fish], 1200, 800, random);
    fish.checkT = 0;
    pond.step(1 / 60);
    expect(fish.flee).toBeGreaterThan(0);
    expect(fish.goal).not.toBeNull();
  });

  it("顶在墙角的鱼几秒内自行离开", () => {
    const random = randomSeed(7);
    const fish = createFish(0, random);
    fish.x = 970 / 1200;
    fish.y = 620 / 800;
    fish.angle = Math.PI / 4;
    const pond = new PondSimulation([fish], 1200, 800, random);
    pond.boundary = [200, 150, 1000, 150, 1000, 650, 200, 650];
    for (let i = 0; i < 60 * 8; i++) pond.step(1 / 60);
    const moved = Math.hypot(fish.x * 1200 - 970, fish.y * 800 - 620);
    expect(moved).toBeGreaterThan(2 * BODY.length * fish.size * pond.scale);
  });
});

describe("深度分离", () => {
  const L = BODY.length * 0.8;
  const W = 1000;
  const H = 700;

  function fleeFish(f: Fish, x: number, y: number, angle: number, depth: number): void {
    f.size = 0.8;
    f.x = x;
    f.y = y;
    f.angle = angle;
    f.fleeAngle = angle;
    f.flee = 9;
    f.v = 150;
    f.goal = null;
    f.checkT = 1e9;
    f.depth = depth;
    f.depthGoal = depth;
  }

  it("深度差 0.5 的并行鱼会彼此推开", () => {
    const random = randomSeed(11);
    const a = createFish(0, random);
    const b = createFish(1, random);
    const pond = new PondSimulation([a, b], W, H, random);
    fleeFish(a, 0.35, 0.5 - (0.15 * L) / H, 0, 0.1);
    fleeFish(b, 0.35, 0.5 + (0.15 * L) / H, 0, 0.6);
    const d0 = Math.abs(a.y - b.y) * H;
    for (let i = 0; i < 150; i++) pond.step(1 / 60);
    expect(Math.abs(a.y - b.y) * H).toBeGreaterThan(d0 * 2);
  });

  it("深度差 0.8 的并行鱼靠深度分离下限仍然彼此推开", () => {
    const random = randomSeed(11);
    const a = createFish(0, random);
    const b = createFish(1, random);
    const pond = new PondSimulation([a, b], W, H, random);
    fleeFish(a, 0.35, 0.5 - (0.15 * L) / H, 0, 0.1);
    fleeFish(b, 0.35, 0.5 + (0.15 * L) / H, 0, 0.9);
    const d0 = Math.abs(a.y - b.y) * H;
    for (let i = 0; i < 150; i++) pond.step(1 / 60);
    expect(Math.abs(a.y - b.y) * H).toBeGreaterThan(d0 * 2);
  });

  it("深度差 0.8 的相向鱼可以叠游穿越", () => {
    const random = randomSeed(13);
    const a = createFish(0, random);
    const b = createFish(1, random);
    const pond = new PondSimulation([a, b], W, H, random);
    fleeFish(a, 0.25, 0.5, 0, 0.1);
    fleeFish(b, 0.75, 0.5, Math.PI, 0.9);
    let minD = Infinity;
    for (let i = 0; i < 180; i++) {
      pond.step(1 / 60);
      minD = Math.min(minD, Math.hypot((a.x - b.x) * W, (a.y - b.y) * H));
    }
    expect(minD).toBeLessThan(L * 2 * 0.35);
    for (const f of [a, b]) {
      expect(Number.isFinite(f.x)).toBe(true);
      expect(Number.isFinite(f.angle)).toBe(true);
    }
  });
});

describe("脊柱表面距", () => {
  function gapOf(pond: PondSimulation, a: Fish, b: Fish): number {
    return spineGap(a, b, a.size * pond.scale, b.size * pond.scale)!.gap;
  }

  it("短鱼鼻尖贴着长鱼尾段并行时，表面距被推正", () => {
    const random = randomSeed(21);
    const a = createFish(0, random);
    const b = createFish(1, random);
    const pond = new PondSimulation([a, b], 1000, 700, random);
    const pin = (f: Fish, size: number, x: number, y: number, cruise: number): void => {
      f.size = size;
      f.x = x;
      f.y = y;
      f.angle = 0;
      f.cruise = cruise;
      f.rest = 1e9;
      f.v = 0;
      f.goal = { x: f.x + 0.5, y: f.y };
      f.goalTime = 1e9;
      f.checkT = 1e9;
      f.depth = 0.5;
      f.depthGoal = 0.5;
    };
    pin(a, 1.2, 0.4, 0.5, 0.4);
    pin(b, 0.3, 0.4 - 76 / 1000, 0.5 + 5 / 700, 1.6);
    pond.step(1 / 60);
    const gap0 = gapOf(pond, a, b);
    expect(gap0).toBeLessThan(0);
    for (let i = 0; i < 120; i++) pond.step(1 / 60);
    expect(gapOf(pond, a, b)).toBeGreaterThan(2);
  });

  it("短鱼垂直穿越长鱼尾段不穿插", () => {
    const random = randomSeed(23);
    const a = createFish(0, random);
    const b = createFish(1, random);
    const pond = new PondSimulation([a, b], 1000, 700, random);
    const flee = (f: Fish, size: number, x: number, y: number, angle: number, v: number): void => {
      f.size = size;
      f.x = x;
      f.y = y;
      f.angle = angle;
      f.fleeAngle = angle;
      f.flee = 9;
      f.v = v;
      f.checkT = 1e9;
      f.depth = 0.5;
      f.depthGoal = 0.5;
    };
    flee(a, 1.2, 0.2, 0.5, 0, 150);
    flee(b, 0.3, 0.45, 0.377, Math.PI / 2, 80);
    let minGap = Infinity;
    let minD = Infinity;
    for (let i = 0; i < 240; i++) {
      pond.step(1 / 60);
      minGap = Math.min(minGap, gapOf(pond, a, b));
      minD = Math.min(minD, Math.hypot((a.x - b.x) * 1000, (a.y - b.y) * 700));
    }
    expect(minD).toBeLessThan((BODY.length * 1.2 + BODY.length * 0.3) * 0.9);
    expect(minGap).toBeGreaterThan(-1);
    for (const f of [a, b]) {
      expect(Number.isFinite(f.x)).toBe(true);
      expect(Number.isFinite(f.angle)).toBe(true);
    }
  });
});

describe("密集稳定性", () => {
  it("中心密集的鱼群散得开、航向不抖动、后期同深度不穿插", () => {
    const random = randomSeed(31);
    const fish = Array.from({ length: 12 }, (_, i) => createFish(i, random));
    const pond = new PondSimulation(fish, 1200, 800, random);
    for (const f of fish) {
      f.x = 0.4 + random() * 0.2;
      f.y = 0.4 + random() * 0.2;
    }
    const spread = (): number => {
      let sum = 0;
      for (let i = 0; i < fish.length; i++)
        for (let j = i + 1; j < fish.length; j++)
          sum += Math.hypot((fish[i]!.x - fish[j]!.x) * 1200, (fish[i]!.y - fish[j]!.y) * 800);
      return sum / ((fish.length * (fish.length - 1)) / 2);
    };
    const d0 = spread();
    let turnSum = 0;
    let deep = 0;
    let samples = 0;
    for (let i = 0; i < 3000; i++) {
      pond.step(1 / 60);
      if (i < 300) for (const f of fish) turnSum += Math.abs(f.turn);
      if (i > 600 && i % 5 === 0)
        for (let a = 0; a < fish.length; a++)
          for (let b = a + 1; b < fish.length; b++) {
            if (Math.abs(fish[a]!.depth - fish[b]!.depth) > 0.25) continue;
            const g = spineGap(
              fish[a]!,
              fish[b]!,
              fish[a]!.size * pond.scale,
              fish[b]!.size * pond.scale,
            );
            if (!g) continue;
            samples++;
            if (g.gap < -3) deep++;
          }
    }
    expect(spread()).toBeGreaterThan(d0 * 1.8);
    expect(turnSum / (300 * fish.length)).toBeLessThan(0.56);
    expect(deep / samples).toBeLessThan(0.01);
    for (const f of fish) {
      expect(Number.isFinite(f.x)).toBe(true);
      expect(Number.isFinite(f.angle)).toBe(true);
    }
  });
});

describe("争抢不叠罗汉", () => {
  it("6 鱼抢 3 颗近邻饲料：争抢期不深度叠压且全部吃完", () => {
    const random = randomSeed(41);
    const fish = Array.from({ length: 6 }, (_, i) => createFish(i, random));
    const pond = new PondSimulation(fish, 1200, 800, random);
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i]!;
      const a = (i / fish.length) * Math.PI * 2;
      f.x = 0.5 + Math.cos(a) * 0.15;
      f.y = 0.5 + Math.sin(a) * 0.15;
      f.angle = a + Math.PI;
    }
    pond.feed(600, 400, 3);
    expect(pond.food.length).toBe(3);
    let deep = 0;
    let samples = 0;
    let maxRun = 0;
    const runs = new Map<string, number>();
    for (let i = 0; i < 360; i++) {
      pond.step(1 / 60);
      if (i % 5 === 0)
        for (let a = 0; a < fish.length; a++)
          for (let b = a + 1; b < fish.length; b++) {
            if (Math.abs(fish[a]!.depth - fish[b]!.depth) > 0.35) continue;
            const g = spineGap(
              fish[a]!,
              fish[b]!,
              fish[a]!.size * pond.scale,
              fish[b]!.size * pond.scale,
            );
            if (!g) continue;
            samples++;
            const key = `${a}-${b}`;
            if (g.gap < -3) {
              deep++;
              const r = (runs.get(key) ?? 0) + 1;
              runs.set(key, r);
              if (r > maxRun) maxRun = r;
            } else runs.delete(key);
          }
    }
    expect(deep / samples).toBeLessThan(0.04);
    expect(maxRun).toBeLessThan(12);
    for (let i = 0; i < 3600 && pond.food.length > 0; i++) pond.step(1 / 60);
    expect(pond.food.length).toBe(0);
    expect(pond.totalEaten).toBe(3);
  });
});

describe("个体性格", () => {
  it("temperOf 由 seed 确定性派生且各系数在标定区间", () => {
    const t = temperOf(12345);
    expect(temperOf(12345)).toEqual(t);
    expect(t.restRate).toBeGreaterThanOrEqual(0.5);
    expect(t.restRate).toBeLessThan(1.8);
    expect(t.wanderAmp).toBeGreaterThanOrEqual(0.7);
    expect(t.wanderAmp).toBeLessThan(1.4);
    expect(t.turnKeen).toBeGreaterThanOrEqual(0.8);
    expect(t.turnKeen).toBeLessThan(1.3);
    expect(t.depthBand).toBeGreaterThanOrEqual(0.35);
    expect(t.depthBand).toBeLessThan(0.65);
    expect(t.scullRate).toBeGreaterThanOrEqual(0.6);
    expect(t.scullRate).toBeLessThan(1.5);
    const distinct = new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(temperOf(i))));
    expect(distinct.size).toBeGreaterThan(45);
  });

  it("怠惰鱼比活泼鱼休息更多、偏好更深水域", () => {
    const run = (temper: Temper): { rest: number; depth: number } => {
      const random = randomSeed(77);
      const f = createFish(0, random);
      f.x = 0.5;
      f.y = 0.5;
      f.angle = 0;
      f.temper = temper;
      const pond = new PondSimulation([f], 1200, 800, random);
      let rest = 0;
      let depthSum = 0;
      for (let i = 0; i < 18000; i++) {
        pond.step(1 / 60);
        if (f.rest > 0) rest++;
        depthSum += f.depth;
      }
      return { rest, depth: depthSum / 18000 };
    };
    const lively = run({
      restRate: 0.5,
      wanderAmp: 1,
      turnKeen: 1,
      depthBand: 0.35,
      scullRate: 1,
    });
    const lazy = run({
      restRate: 1.8,
      wanderAmp: 1,
      turnKeen: 1,
      depthBand: 0.65,
      scullRate: 1,
    });
    expect(lazy.rest).toBeGreaterThan(lively.rest * 1.5);
    expect(lazy.depth).toBeGreaterThan(lively.depth + 0.1);
  });
});

describe("头部微摆", () => {
  it("直游时头段横摆含独立于尾波的微摆分量", () => {
    const random = randomSeed(51);
    const f = createFish(0, random);
    f.x = 0.5;
    f.y = 0.5;
    f.angle = 0;
    f.temper = { restRate: 0, wanderAmp: 0, turnKeen: 1, depthBand: 0.5, scullRate: 1 };
    const pond = new PondSimulation([f], 4000, 3000, random);
    f.goal = { x: 0.9, y: 0.5 };
    f.goalTime = 1e9;
    let maxHead = 0;
    let maxTail = 0;
    for (let i = 0; i < 300; i++) {
      pond.step(1 / 60);
      const pose = fishPose(f, f.size * pond.scale);
      const p = f.spine!;
      const head = Math.hypot(pose[0]! - p[0], pose[1]! - p[1]);
      const tail = Math.hypot(pose[64]! - p[32], pose[65]! - p[33]);
      if (head > maxHead) maxHead = head;
      if (tail > maxTail) maxTail = tail;
    }
    expect(maxHead / maxTail).toBeGreaterThan(0.12);
  });
});

describe("鳍划水", () => {
  it("怠速时胸鳍两侧反相慢速划水", () => {
    const random = randomSeed(53);
    const f = createFish(0, random);
    f.rest = 1e9;
    f.thrust = 0;
    f.turn = 0;
    f.v = 0;
    const n = 240;
    const vals: [number, number][] = [];
    let minL = Infinity;
    let maxL = -Infinity;
    for (let i = 0; i < n; i++) {
      const t = i / 60;
      const l = finSpread(f, t, 1, 0.95, 0);
      const r = finSpread(f, t, -1, 0.95, 0);
      vals.push([l, r]);
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
    }
    const ml = vals.reduce((s, v) => s + v[0], 0) / n;
    const mr = vals.reduce((s, v) => s + v[1], 0) / n;
    let cov = 0;
    for (const [l, r] of vals) cov += (l - ml) * (r - mr);
    expect((maxL - minL) / 0.95).toBeGreaterThan(0.5);
    expect(cov).toBeLessThan(-1);
  });
});

describe("过弯漂移", () => {
  it("转弯时鱼体向弯内漂移，横移随尾部递增", () => {
    const random = randomSeed(57);
    const f = createFish(0, random);
    f.x = 0.5;
    f.y = 0.5;
    f.angle = 0;
    f.amp = 0.6;
    f.phase = 1.3;
    updateSpine(f, 1, 1000, 800);
    f.turn = 0;
    const base = fishPose(f, 1);
    f.turn = 1;
    const carved = fishPose(f, 1);
    const lat = (pose: Float32Array, i: number): number => pose[i * 4 + 1]! - f.spine![i * 2 + 1]!;
    const d = (i: number): number => lat(carved, i) - lat(base, i);
    expect(d(0)).toBeLessThan(d(8));
    expect(d(8)).toBeLessThan(d(16));
    expect(d(16)).toBeGreaterThan(1);
  });
});

describe("重新投放", () => {
  it("respawn 后全员落位开阔、彼此分开且状态归零", () => {
    const random = randomSeed(8);
    const fish = Array.from({ length: 12 }, (_, i) => createFish(i, random));
    const shoal = createSilverCarpShoal(random);
    const pond = new PondSimulation(fish, 1200, 800, random, shoal, true);
    for (const f of pond.allFish) {
      f.x = 0.5;
      f.y = 0.5;
      f.v = 40;
      f.goal = { x: 0.5, y: 0.5 };
      f.flee = 3;
      f.rest = 2;
    }
    pond.respawn();
    const L = (f: Fish): number => BODY.length * f.size * pond.scale;
    for (const f of pond.allFish) {
      expect(pond.field.clearance(f.x * 1200, f.y * 800)).toBeGreaterThan(0);
      expect(f.v).toBe(0);
      expect(f.flee).toBe(0);
      expect(f.goal).toBeNull();
    }
    const all = pond.allFish;
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(
          Math.hypot((all[i]!.x - all[j]!.x) * 1200, (all[i]!.y - all[j]!.y) * 800),
        ).toBeGreaterThan((L(all[i]!) + L(all[j]!)) * 0.7 - 1);
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
