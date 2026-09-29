import { BODY, updateSpine } from "./fish.ts";
import { clamp, TAU, wrap } from "./math.ts";
import type { EatEvent, Fish, Food, Obstacle } from "./types.ts";

export class PondSimulation {
  fish: Fish[];
  residents: Fish[];
  residentsOn: boolean;
  width: number;
  height: number;
  random: () => number;
  food: Food[] = [];
  totalEaten = 0;
  scale = 1;
  time = 0;
  obstacles: Obstacle[] = [];
  events: EatEvent[] = [];

  constructor(
    fish: Fish[],
    width: number,
    height: number,
    random: () => number = Math.random,
    residents: Fish[] = [],
    residentsOn = true,
  ) {
    this.fish = fish;
    this.residents = residents;
    this.residentsOn = residentsOn;
    this.width = width;
    this.height = height;
    this.random = random;
  }

  get allFish(): Fish[] {
    return this.residentsOn ? this.fish.concat(this.residents) : this.fish;
  }

  feed(x: number, y: number, count = 9): boolean {
    if (this.food.length >= 180) return false;
    for (let i = 0; i < count && this.food.length < 180; i++) {
      const a = this.random() * TAU;
      const r = Math.sqrt(this.random()) * 24;
      this.food.push({
        x: clamp(x + Math.cos(a) * r, 15, this.width - 15),
        y: clamp(y + Math.sin(a) * r, 15, this.height - 15),
        life: 25,
        age: 0,
        drift: this.random() * 6,
        vx: Math.cos(a) * r * 0.8,
        vy: Math.sin(a) * r * 0.8,
        eaten: false,
      });
    }
    return true;
  }

  scare(x: number, y: number, radius = 170): void {
    for (const f of this.allFish) {
      const dx = f.x * this.width - x;
      const dy = f.y * this.height - y;
      const d = Math.hypot(dx, dy);
      if (d < radius) {
        f.flee = 0.45 + (1 - d / radius) * 0.7;
        f.fleeAngle = Math.atan2(dy, dx) + (this.random() - 0.5) * 0.9;
        f.beating = true;
        f.v = Math.max(f.v, BODY.length * f.size * this.scale * 0.8);
        f.depthGoal = Math.min(0.95, f.depth + 0.35);
      }
    }
  }

  pickGoal(f: Fish): void {
    const r = this.random;
    const w = this.width;
    const h = this.height;
    const m = 0.15;
    const span = Math.min(w, h);
    let best: { x: number; y: number } | null = null;
    let score = -Infinity;
    for (let i = 0; i < 8; i++) {
      const gx = m + r() * (1 - 2 * m);
      const gy = m + r() * (1 - 2 * m);
      const dx = (gx - f.x) * w;
      const dy = (gy - f.y) * h;
      const d = Math.hypot(dx, dy);
      if (this.obstacles.some((o) => Math.hypot(gx * w - o.x, gy * h - o.y) < o.r + 40)) continue;
      const sc =
        -Math.abs(wrap(Math.atan2(dy, dx) - f.angle)) * 1.2 +
        (Math.min(d, span * 0.6) / span) * 2 +
        r() * 0.6;
      if (sc > score) {
        score = sc;
        best = { x: gx, y: gy };
      }
    }
    f.goal = best ?? { x: 0.5, y: 0.5 };
    f.goalTime = 7 + r() * 12;
  }

  step(dt: number, speedFactor = 1): void {
    dt = clamp(dt, 0, 0.05);
    this.time += dt;
    const w = this.width;
    const h = this.height;
    for (const p of this.food) {
      p.life -= dt;
      p.age += dt;
      const k = Math.exp(-dt * 1.8);
      p.vx *= k;
      p.vy *= k;
      p.x = clamp(p.x + (p.vx + Math.sin(this.time * 0.35 + p.drift) * 1.2) * dt, 8, w - 8);
      p.y = clamp(p.y + (p.vy + Math.cos(this.time * 0.29 + p.drift * 1.3) * 1.2) * dt, 8, h - 8);
    }
    this.food = this.food.filter((p) => p.life > 0 && !p.eaten);
    const sdt = dt * clamp(speedFactor, 0.1, 3);
    const neighbours = this.allFish;
    for (const f of neighbours) this.swim(f, sdt, neighbours);
    if (this.food.some((p) => p.eaten)) this.food = this.food.filter((p) => !p.eaten);
  }

  swim(f: Fish, dt: number, neighbours: Fish[] = this.allFish): void {
    const w = this.width;
    const h = this.height;
    const s = f.size * this.scale;
    const L = BODY.length * s;
    const random = this.random;
    const silver = f.species === "silvercarp";
    let x = f.x * w;
    let y = f.y * h;
    const cos = Math.cos(f.angle);
    const sin = Math.sin(f.angle);
    const mx = x + cos * BODY.nose * s;
    const my = y + sin * BODY.nose * s;
    let food: Food | null = null;
    let fd = Infinity;
    const reach = Math.max(w, h) * f.appetite;
    const candidates: Food[] = silver ? [] : this.food;
    for (const p of candidates) {
      if (p.eaten) continue;
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < fd && d < reach && p.age > f.react + d / 650) {
        fd = d;
        food = p;
      }
    }
    let gx: number;
    let gy: number;
    let want: number;
    let turnGain = silver ? 3.5 : 2;
    let maxTurn = silver ? 2.4 : 1.3;
    let sepW = 2.4;
    let boundW = 3;
    f.flee = Math.max(0, f.flee - dt);
    if (f.flee > 0) {
      gx = Math.cos(f.fleeAngle);
      gy = Math.sin(f.fleeAngle);
      want = 2.6 * L;
      turnGain = 9;
      maxTurn = 7;
    } else if (food) {
      const fx = food as Food;
      const dx = fx.x - x;
      const dy = fx.y - y;
      const d = Math.hypot(dx, dy) || 1;
      const err = Math.abs(wrap(Math.atan2(dy, dx) - f.angle));
      gx = dx / d;
      gy = dy / d;
      want =
        clamp((fd / L) * 1.3, 0.25, 2.2) *
        L *
        Math.max(0.12, Math.cos(Math.min(err, Math.PI / 2)) ** 2);
      if (d < BODY.nose * s * 1.15 && err > 0.6) {
        gx = cos;
        gy = sin;
        want = 0.7 * L;
      }
      turnGain = 4.5;
      maxTurn = 3.4;
      sepW = 1.1;
      boundW = 0.8;
      f.depthGoal = 0.04;
      if (fd < Math.max(6, 7 * s)) {
        fx.eaten = true;
        f.eaten++;
        this.totalEaten++;
        this.events.push({ type: "eat", x: fx.x, y: fx.y, fish: f });
      }
    } else {
      f.goalTime -= dt;
      if (!f.goal || f.goalTime <= 0 || Math.hypot(f.goal.x * w - x, f.goal.y * h - y) < L * 1.3)
        this.pickGoal(f);
      const goal = f.goal!;
      const a =
        Math.atan2(goal.y * h - y, goal.x * w - x) +
        Math.sin(this.time * 0.21 + f.seed) * 0.45 +
        Math.sin(this.time * 0.53 + f.seed * 1.7) * 0.2;
      gx = Math.cos(a);
      gy = Math.sin(a);
      f.rest = Math.max(0, f.rest - dt);
      if (f.rest <= 0 && random() < dt * 0.02)
        f.rest = silver ? 0.6 + random() * 1.2 : 2 + random() * 4;
      want = f.cruise * L * (f.rest > 0 ? 0.12 : 1);
      if (random() < dt * 0.015)
        f.depthGoal = silver ? 0.18 + random() * 0.4 : 0.15 + random() * 0.75;
    }
    let sx = 0;
    let sy = 0;
    let ax = 0;
    let ay = 0;
    let cx = 0;
    let cy = 0;
    let companions = 0;
    for (const o of neighbours) {
      if (o === f) continue;
      const ox = o.x * w - x;
      const oy = o.y * h - y;
      const d = Math.hypot(ox, oy);
      if (d < 1e-6) continue;
      const R = (L + BODY.length * o.size * this.scale) * 0.52;
      const near = 1 - Math.min(1, Math.abs(o.depth - f.depth) * 1.6);
      if (d < R) {
        const k = (1 - d / R) ** 2 * near;
        sx -= (ox / d) * k;
        sy -= (oy / d) * k;
      }
      if ((ox * cos + oy * sin) / d > 0.8 && d < L * 1.6 && near > 0.3) {
        const side = oy * cos - ox * sin > 0 ? -1 : 1;
        const k = 0.35 * (1 - d / (L * 1.6));
        sx -= sin * side * k;
        sy += cos * side * k;
      }
      if (!food && d < L * 2.5 && o.species === f.species) {
        ax += Math.cos(o.angle);
        ay += Math.sin(o.angle);
      }
      if (silver && o.species === f.species && d < L * 5) {
        cx += ox;
        cy += oy;
        companions++;
      }
    }
    if (companions && f.flee <= 0) {
      const d = Math.hypot(cx, cy);
      if (d > L) {
        gx += (cx / d) * 0.65;
        gy += (cy / d) * 0.65;
      }
    }
    const al = Math.hypot(ax, ay);
    if (al > 0) {
      ax /= al;
      ay /= al;
    }
    const mX = Math.min(w * 0.1 + L * 0.3, w * 0.3);
    const mY = Math.min(h * 0.1 + L * 0.3, h * 0.3);
    const lx = x + cos * L * 1.2;
    const ly = y + sin * L * 1.2;
    let bx = 0;
    let by = 0;
    if (lx < mX) bx = (mX - lx) / mX;
    else if (lx > w - mX) bx = (w - mX - lx) / mX;
    if (ly < mY) by = (mY - ly) / mY;
    else if (ly > h - mY) by = (h - mY - ly) / mY;
    for (const ob of this.obstacles)
      for (const [px, py, R] of [
        [lx, ly, ob.r + L * 0.4],
        [x, y, ob.r + L * 0.2],
      ]) {
        const dx = px - ob.x;
        const dy = py - ob.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < R) {
          const k = (1 - d / R) * 2.5;
          bx += (dx / d) * k;
          by += (dy / d) * k;
        }
      }
    const desired = Math.atan2(
      gy + sy * sepW + ay * 0.15 + by * boundW,
      gx + sx * sepW + ax * 0.15 + bx * boundW,
    );
    f.turn +=
      (clamp(wrap(desired - f.angle) * turnGain, -maxTurn, maxTurn) - f.turn) *
      Math.min(1, dt * (f.flee > 0 ? 14 : silver ? 7 : 4));
    f.angle = wrap(f.angle + f.turn * dt);
    if (f.v < want * 0.8) f.beating = true;
    else if (f.v > want * 1.15) f.beating = false;
    f.thrust += ((f.beating ? 1 : 0) - f.thrust) * Math.min(1, dt * 6);
    if (f.beating)
      f.v += (want * 1.25 - f.v) * (1 - Math.exp(-dt * (silver ? 3.4 : 2.4) * f.thrust));
    else f.v *= Math.exp(-dt * (f.v > want * 1.6 ? 1.6 : 0.5));
    f.v *= Math.exp(-dt * Math.abs(f.turn) * (silver ? 0.17 : 0.25));
    const bl = f.v / L;
    f.phase =
      (f.phase +
        dt *
          TAU *
          (silver ? 1.22 : 1) *
          (0.45 + f.thrust * (1.1 + 1.3 * Math.min(2.5, bl)) + Math.abs(f.turn) * 0.35)) %
      (TAU * 1000);
    f.amp +=
      (0.14 +
        0.86 * f.thrust * Math.min(1, 0.5 + bl * 0.6) +
        Math.min(0.4, Math.abs(f.turn) * 0.25) -
        f.amp) *
      Math.min(1, dt * 3);
    x += Math.cos(f.angle) * f.v * dt;
    y += Math.sin(f.angle) * f.v * dt;
    f.x = clamp(x / w, 0.03, 0.97);
    f.y = clamp(y / h, 0.035, 0.965);
    f.depth += (f.depthGoal - f.depth) * Math.min(1, dt * (food ? 1.2 : 0.35));
    updateSpine(f, s, w, h);
  }
}
