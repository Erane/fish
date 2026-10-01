import { describe, it, expect } from "vite-plus/test";
import { Field, SHORE, scanHeading } from "../src/core/navigator.ts";
import { TAU } from "../src/core/math.ts";

const W = 1200;
const H = 800;
const SQUARE = [200, 150, 1000, 150, 1000, 650, 200, 650];
const open = new Field(null, W, H, []);
const pond = new Field(SQUARE, W, H, []);
const withRock = new Field(SQUARE, W, H, [{ x: 600, y: 400, r: 120 }]);
const SLOT = [700, 340, 1000, 340, 1000, 460, 700, 460];
const slot = new Field(SLOT, W, H, []);
const LSHAPE = [120, 90, 1480, 90, 1480, 810, 560, 810, 560, 450, 120, 450];
const arm = new Field(LSHAPE, 1600, 900, []);
const POCKET = [590, 385, 650, 385, 650, 435, 590, 435];
const pocket = new Field(POCKET, 1200, 800, []);
const L = 80;
const IN = L * SHORE;
const RIGHT = 1000 - IN;
const BOTTOM = 650 - IN;

describe("Field 净空场", () => {
  it("多边形边界内为正、边界外为负", () => {
    expect(pond.clearance(600, 400)).toBeCloseTo(250, 0);
    expect(pond.clearance(100, 400)).toBeLessThan(0);
  });

  it("没有多边形时按视口边缘计算净空", () => {
    expect(open.clearance(600, 400)).toBeCloseTo(400, 0);
    expect(open.clearance(1190, 400)).toBeCloseTo(10, 0);
    expect(open.clearance(1300, 400)).toBeLessThan(0);
  });

  it("障碍物按表面距离参与净空，与边界取最近的一个", () => {
    expect(withRock.clearance(600, 400)).toBeCloseTo(-120, 0);
    expect(withRock.clearance(600, 560)).toBeCloseTo(40, 0);
    expect(pond.clearance(600, 560)).toBeCloseTo(90, 0);
  });

  it("inside 按体长把点收回到岸线安全距离外", () => {
    const [x, y] = pond.inside(1050, 400, L);
    expect(x).toBeCloseTo(RIGHT, 0);
    expect(y).toBeCloseTo(400, 0);
    const [ox, oy] = open.inside(1300, -50, L);
    expect(ox).toBeCloseTo(W - IN, 0);
    expect(oy).toBeCloseTo(IN, 0);
  });

  it("inside 让点从荷叶边缘让开", () => {
    const [x, y] = withRock.inside(660, 400, L);
    expect(Math.hypot(x - 600, y - 400)).toBeCloseTo(120 + IN, 1);
    expect(y).toBeCloseTo(400, 6);
  });

  it("凹角里沿径向收回，切向自由、径向受护", () => {
    const [ax, ay] = arm.inside(580, 440, L);
    expect(Math.hypot(ax - 560, ay - 450)).toBeCloseTo(IN, 1);
    const [bx, by] = arm.inside(ax + 9, ay - 4, L);
    expect(Math.hypot(bx - ax, by - ay)).toBeGreaterThan(4);
    expect(arm.clearance(bx, by)).toBeGreaterThanOrEqual(IN - 1e-6);
    const [cx, cy] = arm.inside(ax - 9, ay + 4, L);
    expect(Math.hypot(cx - 560, cy - 450)).toBeCloseTo(IN, 6);
    expect(Math.atan2(cy - 450, cx - 560)).toBeCloseTo(Math.atan2(ay + 4 - 450, ax - 9 - 560), 6);
  });
});

describe("scanHeading 扇形探路", () => {
  it("前方走廊通畅时不做修正", () => {
    const h = scanHeading(pond, 600, 400, 0, L, 1);
    expect(h.block).toBe(0);
    expect(h.x).toBeCloseTo(1, 5);
    expect(h.y).toBeCloseTo(0, 5);
  });

  it("平行贴墙游动不受干扰", () => {
    expect(scanHeading(pond, RIGHT, 400, Math.PI / 2, L, 1).block).toBeLessThan(0.15);
  });

  it("正对墙时沿墙绕走，而不是掉头", () => {
    const h = scanHeading(pond, RIGHT, 400, 0, L, 1);
    expect(h.block).toBeGreaterThan(0.8);
    expect(Math.abs(h.y)).toBeGreaterThan(Math.abs(h.x));
  });

  it("斜顶右墙时顺着墙走", () => {
    const h = scanHeading(pond, RIGHT - 20, 400, Math.PI / 4, L, 1);
    expect(h.y).toBeGreaterThan(0.5);
    expect(h.x).toBeLessThan(0.5);
  });

  it("窄胡同左右都绕不过去才回头", () => {
    const h = scanHeading(slot, 1000 - IN - 20, 400, 0, L, 1);
    expect(h.block).toBeGreaterThan(0.8);
    expect(h.x).toBeLessThan(-0.7);
  });

  it("顶在角落时朝角落外走", () => {
    const h = scanHeading(pond, RIGHT - 20, BOTTOM - 20, Math.PI / 4, L, 1);
    expect(h.x).toBeLessThan(-0.2);
    expect(h.y).toBeLessThan(0.5);
  });

  it("L 形凹角里不继续顶墙", () => {
    const h = scanHeading(arm, 560 + IN + 20, 500, Math.PI, L, 1);
    expect(h.x).toBeGreaterThan(-0.2);
  });

  it("荷叶挡路时从叶子侧面绕过去", () => {
    const h = scanHeading(withRock, 420, 400, 0, L, 1);
    expect(h.block).toBeGreaterThan(0.2);
    expect(Math.abs(h.y)).toBeGreaterThan(0.5);
  });

  it("越界后朝池内回来", () => {
    const h = scanHeading(pond, 120, 400, 0, L, 1);
    expect(h.block).toBeGreaterThan(0.5);
    expect(h.x).toBeGreaterThan(0.7);
  });

  it("同一状态下结果确定且连续，不逐帧翻脸", () => {
    const a = scanHeading(pond, RIGHT, 400, 0, L, 1);
    const b = scanHeading(pond, RIGHT, 400, 0, L, 1);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
    let prev = scanHeading(pond, RIGHT, 400, 0, L, 1);
    for (let turn = 0.02; turn <= 0.3; turn += 0.02) {
      const next = scanHeading(pond, RIGHT, 400, turn, L, 1);
      expect(next.x * prev.x + next.y * prev.y).toBeGreaterThan(0.9);
      prev = next;
    }
  });

  it("惯用转身侧决定左右同分时的选择", () => {
    const up = scanHeading(pond, RIGHT, 400, 0, L, -1);
    const down = scanHeading(pond, RIGHT, 400, 0, L, 1);
    expect(Math.sign(up.y)).not.toBe(Math.sign(down.y));
  });

  it("四面受阻时指向净空最大的方向，而不是继续顶墙", () => {
    const probe = (h: { x: number; y: number }): number => {
      let q = Infinity;
      for (const r of [0.5, 1.1]) {
        const v = pocket.clearance(620 + h.x * L * r, 410 + h.y * L * r);
        if (v < q) q = v;
      }
      return q;
    };
    let bestQ = -Infinity;
    for (let i = -12; i <= 12; i++) {
      const a = i * (Math.PI / 12);
      bestQ = Math.max(bestQ, probe({ x: Math.cos(a), y: Math.sin(a) }));
    }
    const h = scanHeading(pocket, 620, 410, 0, L, 1);
    expect(probe(h)).toBeCloseTo(bestQ, 6);
  });

  it("探路结果为单位向量且数值有限", () => {
    for (let a = 0; a < TAU; a += 0.4) {
      const h = scanHeading(pond, 300, 600, a, L, 1);
      expect(Math.hypot(h.x, h.y)).toBeCloseTo(1, 4);
      expect(Number.isFinite(h.block)).toBe(true);
    }
  });
});
