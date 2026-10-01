import { describe, expect, it } from "vite-plus/test";
import { pointInPoly, pushInside, signedDistToPoly } from "../src/core/boundary.ts";
import { BODY } from "../src/core/fish.ts";
import {
  createFish,
  createSilverCarpShoal,
  PondSimulation,
  randomSeed,
  SHORE,
} from "../src/core/index.ts";
import { wrap } from "../src/core/math.ts";

const SQUARE = [0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8];
const W = 1200;
const H = 800;
const LSHAPE = [120, 90, 1080, 90, 1080, 700, 560, 700, 560, 450, 120, 450];
const SLOT = [700, 300, 1000, 300, 1000, 500, 700, 500];
const RECT = [200, 150, 1000, 150, 1000, 650, 200, 650];
const IRREGULAR = [
  504, 63, 864, 112, 1056, 288, 1032, 528, 792, 704, 528, 640, 360, 720, 144, 528, 192, 240,
];
const OBSTACLES = [
  { x: 600, y: 360, r: 80 },
  { x: 400, y: 585, r: 64 },
  { x: 900, y: 540, r: 72 },
];
const WINDOW = 60;

function pond(poly: number[] | null, obstacles: boolean, fishCount = 8) {
  const random = randomSeed(7);
  const fish = Array.from({ length: fishCount }, (_, i) => createFish(i, random));
  const sim = new PondSimulation(fish, W, H, random, createSilverCarpShoal(random));
  sim.boundary = poly;
  sim.obstacles = obstacles ? OBSTACLES : [];
  return { sim, all: sim.allFish };
}

const bodyLength = (f: { size: number }, scale: number) => BODY.length * f.size * scale;

describe("pointInPoly", () => {
  it("detects interior and exterior", () => {
    expect(pointInPoly(0.5, 0.5, SQUARE)).toBe(true);
    expect(pointInPoly(0.1, 0.5, SQUARE)).toBe(false);
    expect(pointInPoly(0.9, 0.9, SQUARE)).toBe(false);
  });
});

describe("signedDistToPoly", () => {
  it("is positive inside and negative outside", () => {
    expect(signedDistToPoly(0.5, 0.5, SQUARE)).toBeGreaterThan(0);
    expect(signedDistToPoly(0.1, 0.5, SQUARE)).toBeLessThan(0);
  });

  it("measures perpendicular distance to the nearest edge", () => {
    expect(signedDistToPoly(0.5, 0.5, SQUARE)).toBeCloseTo(0.3, 5);
    expect(signedDistToPoly(0.5, 0.3, SQUARE)).toBeCloseTo(0.1, 5);
    expect(signedDistToPoly(0.5, 0.1, SQUARE)).toBeCloseTo(-0.1, 5);
  });
});

describe("pushInside", () => {
  it("leaves a point already inside by more than the margin untouched", () => {
    const [x, y] = pushInside(0.5, 0.5, SQUARE, 0.05);
    expect(x).toBeCloseTo(0.5, 5);
    expect(y).toBeCloseTo(0.5, 5);
  });

  it("moves an outside point back inside the margin", () => {
    const [x, y] = pushInside(0.5, 0.05, SQUARE, 0.1);
    expect(signedDistToPoly(x, y, SQUARE)).toBeGreaterThanOrEqual(0.1 - 1e-6);
  });

  it("凹角处沿径向收回，切向位移不被抹掉", () => {
    const [x, y] = pushInside(580, 440, LSHAPE, 44);
    expect(Math.hypot(x - 560, y - 450)).toBeCloseTo(44, 6);
    const [nx, ny] = pushInside(x + 6, y - 3, LSHAPE, 44);
    expect(Math.hypot(nx - x, ny - y)).toBeGreaterThan(3);
  });
});

describe("PondSimulation with a polygon boundary", () => {
  it("keeps every fish inside the water region", () => {
    const random = randomSeed(5);
    const fish = Array.from({ length: 12 }, (_, i) => createFish(i, random));
    const sim = new PondSimulation(fish, 800, 600, random);
    sim.boundary = [200, 150, 600, 150, 600, 450, 200, 450];
    for (let i = 0; i < 2500; i++) sim.step(0.04);
    for (const f of fish) {
      expect(pointInPoly(f.x * 800, f.y * 600, sim.boundary!)).toBe(true);
      expect(Number.isFinite(f.angle)).toBe(true);
    }
  });
});

describe("顶墙与回头", () => {
  it("钻进死胡同的鱼很快掉头，并持续退出胡同", () => {
    const { sim, all } = pond(SLOT, false, 1);
    const f = all[0];
    const L = bodyLength(f, sim.scale);
    [f.x, f.y] = [(1000 - L * 0.6) / W, 400 / H];
    [f.angle, f.rest, f.flee] = [0, 0, 0];
    const start = f.x * W;
    let mark = start;
    for (let i = 0; i < 60 * 6; i++) {
      sim.step(1 / 60);
      if (i === 59) expect(Math.cos(f.angle)).toBeLessThan(-0.3);
      if (i % 30 !== 29) continue;
      const x = f.x * W;
      if (i > 90) expect(mark - x).toBeGreaterThan(0.05 * L);
      mark = x;
    }
    expect(f.x * W).toBeLessThan(start - L);
  });

  it("顶在 L 形凹角的鱼持续脱困，转身不来回抽搐", () => {
    const { sim, all } = pond(LSHAPE, false, 2);
    const f = all[1];
    const L = bodyLength(f, sim.scale);
    const [x0, y0] = [560 + L * SHORE + 4, 520];
    [f.x, f.y] = [x0 / W, y0 / H];
    [f.angle, f.rest, f.flee] = [Math.PI, 0, 0];
    let sign = 0;
    let flips = 0;
    let progress = 0;
    for (let i = 0; i < 60 * 6; i++) {
      const before = f.angle;
      sim.step(1 / 60);
      const turn = wrap(f.angle - before);
      if (Math.abs(turn) > 1e-3) {
        if (sign !== 0 && Math.sign(turn) !== sign) flips++;
        sign = Math.sign(turn);
      }
      if (i % 30 === 29) {
        const d = Math.hypot(f.x * W - x0, f.y * H - y0);
        if (i > 60) expect(d - progress).toBeGreaterThan(0.1 * L);
        progress = d;
      }
    }
    expect(progress).toBeGreaterThan(1.5 * L);
    expect(flips).toBeLessThanOrEqual(8);
  });

  it("一小时仿真里几乎没有顶墙不进的时刻", () => {
    const cases: readonly (readonly [number[] | null, boolean])[] = [
      [LSHAPE, false],
      [LSHAPE, true],
      [IRREGULAR, true],
      [RECT, false],
    ];
    for (const [poly, obstacles] of cases) {
      const { sim, all } = pond(poly, obstacles);
      const hist = all.map(() => [] as number[][]);
      const streak = all.map(() => 0);
      let stalls = 0;
      let worst = 0;
      for (let i = 0; i < 60 * 60; i++) {
        sim.step(1 / 60);
        for (let k = 0; k < all.length; k++) {
          const f = all[k];
          const L = bodyLength(f, sim.scale);
          const x = f.x * W;
          const y = f.y * H;
          const h = hist[k];
          h.push([x, y]);
          if (h.length > WINDOW) h.shift();
          if (h.length < WINDOW) continue;
          const moved = Math.hypot(x - h[0][0], y - h[0][1]);
          const near =
            (poly ? signedDistToPoly(x, y, poly) : Math.min(x, y, W - x, H - y)) < L * 1.2;
          if (f.rest <= 0 && near && f.v > L * 0.25 && moved < f.v * 0.45) {
            stalls++;
            streak[k]++;
            worst = Math.max(worst, streak[k]);
          } else streak[k] = 0;
        }
      }
      expect(stalls / (60 * 60 * all.length)).toBeLessThan(0.01);
      expect(worst).toBeLessThan(90);
    }
  });
});
