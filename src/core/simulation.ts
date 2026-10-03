import { BODY, chaseStagger, peckStagger, updateSpine } from "./fish.ts";
import { clamp, TAU, wrap } from "./math.ts";
import { Field, handed, scanHeading } from "./navigator.ts";
import type { EatEvent, Fish, Food, Goal, Obstacle } from "./types.ts";

const GOAL_SAMPLES = 8;
const FOOD_MAX = 180;

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
  boundary: number[] | null = null;
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

  get field(): Field {
    return new Field(this.boundary, this.width, this.height, this.obstacles);
  }

  feed(x: number, y: number, count = 9): boolean {
    if (this.food.length >= FOOD_MAX) return false;
    const field = this.field;
    const pellet = BODY.length * this.scale;
    let placed = 0;
    for (let i = 0; i < count && this.food.length < FOOD_MAX; i++) {
      const a = this.random() * TAU;
      const r = Math.sqrt(this.random()) * 24;
      const [fx, fy] = field.inside(x + Math.cos(a) * r, y + Math.sin(a) * r, pellet);
      if (field.clearance(fx, fy) < 0) continue;
      this.food.push({
        x: fx,
        y: fy,
        life: 25,
        age: 0,
        drift: this.random() * 6,
        vx: Math.cos(a) * r * 0.8,
        vy: Math.sin(a) * r * 0.8,
        eaten: false,
        claims: 0,
      });
      placed++;
    }
    return placed > 0;
  }

  scare(x: number, y: number, radius = 170): void {
    const field = this.field;
    for (const f of this.allFish) {
      const dx = f.x * this.width - x;
      const dy = f.y * this.height - y;
      const d = Math.hypot(dx, dy);
      if (d < radius) {
        const L = BODY.length * f.size * this.scale;
        const away = Math.atan2(dy, dx) + (this.random() - 0.5) * 0.9;
        const head = scanHeading(
          field,
          f.x * this.width,
          f.y * this.height,
          away,
          L,
          handed(f.seed),
        );
        f.flee = 0.45 + (1 - d / radius) * 0.7;
        f.fleeAngle = head.block > 0 ? Math.atan2(head.y, head.x) : away;
        f.beating = true;
        f.v = Math.max(f.v, L * 0.8);
        f.depthGoal = Math.min(0.95, f.depth + 0.35);
      }
    }
  }

  respawn(): void {
    const field = this.field;
    const w = this.width;
    const h = this.height;
    const placed: Fish[] = [];
    for (const f of this.allFish) {
      const L = BODY.length * f.size * this.scale;
      let spot: Goal | null = null;
      let fallback: Goal | null = null;
      let fallbackClear = -Infinity;
      for (const s of this.spots(field, 12)) {
        if (s.clear > fallbackClear) {
          fallbackClear = s.clear;
          fallback = s.goal;
        }
        const apart = placed.every(
          (o) =>
            Math.hypot((o.x - s.goal.x) * w, (o.y - s.goal.y) * h) >=
            (L + BODY.length * o.size * this.scale) * 0.7,
        );
        if (s.clear >= L * 0.8 && apart) {
          spot = s.goal;
          break;
        }
      }
      const goal = spot ?? fallback!;
      const [px, py] = field.inside(goal.x * w, goal.y * h, L);
      f.x = px / w;
      f.y = py / h;
      f.angle = this.random() * TAU;
      f.phase = this.random() * 10;
      f.v = 0;
      f.turn = 0;
      f.thrust = 0;
      f.beating = false;
      f.goal = null;
      f.goalTime = 0;
      f.target = null;
      f.flee = 0;
      f.wary = 0;
      f.peck = 0;
      f.peckCd = peckStagger(f.seed);
      f.chase = null;
      f.chaseT = 0;
      f.chaseCd = chaseStagger(f.seed);
      f.rest = 0;
      f.checkT = 2 + this.random() * 2;
      f.checkX = f.x;
      f.checkY = f.y;
      placed.push(f);
    }
  }

  private spots(field: Field, count: number): { goal: Goal; clear: number }[] {
    const r = this.random;
    const m = 0.15;
    const w = this.width;
    const h = this.height;
    const list: { goal: Goal; clear: number }[] = [];
    for (let i = 0; i < count; i++) {
      const goal = { x: m + r() * (1 - 2 * m), y: m + r() * (1 - 2 * m) };
      list.push({ goal, clear: field.clearance(goal.x * w, goal.y * h) });
    }
    return list;
  }

  private crowdOnPath(f: Fish, gx: number, gy: number): number {
    const w = this.width;
    const h = this.height;
    const fx = f.x * w;
    const fy = f.y * h;
    const dx = gx * w - fx;
    const dy = gy * h - fy;
    const len2 = dx * dx + dy * dy || 1;
    let crowd = 0;
    for (const o of this.allFish) {
      if (o === f) continue;
      const ox = o.x * w;
      const oy = o.y * h;
      const t = clamp(((ox - fx) * dx + (oy - fy) * dy) / len2, 0, 1);
      const reach = (BODY.length * f.size + BODY.length * o.size) * this.scale * 1.1;
      if (Math.hypot(ox - (fx + dx * t), oy - (fy + dy * t)) < reach) crowd++;
    }
    return crowd;
  }

  private jamOf(f: Fish): number {
    const w = this.width;
    const h = this.height;
    const L = BODY.length * f.size * this.scale;
    let nn = Infinity;
    for (const o of this.allFish) {
      if (o === f) continue;
      const d = Math.hypot((o.x - f.x) * w, (o.y - f.y) * h);
      if (d < nn) nn = d;
    }
    return clamp(1 - nn / (L * 2.5), 0, 1);
  }

  private openSpot(field: Field, samples: number, f: Fish): Goal {
    let best: Goal = { x: 0.5, y: 0.5 };
    let score = -Infinity;
    for (const s of this.spots(field, samples)) {
      const v =
        s.clear - this.crowdOnPath(f, s.goal.x, s.goal.y) * BODY.length * f.size * this.scale * 1.5;
      if (v > score) {
        score = v;
        best = s.goal;
      }
    }
    return best;
  }

  private escape(f: Fish, field: Field): void {
    const spot = this.openSpot(field, 24, f);
    f.goal = spot;
    f.goalTime = 6 + this.random() * 4;
    f.flee = 1.1;
    const away = Math.atan2((spot.y - f.y) * this.height, (spot.x - f.x) * this.width);
    const head = scanHeading(
      field,
      f.x * this.width,
      f.y * this.height,
      away,
      BODY.length * f.size * this.scale,
      handed(f.seed),
    );
    f.fleeAngle = head.block > 0 ? Math.atan2(head.y, head.x) : away;
  }

  pickGoal(f: Fish, field: Field): void {
    const r = this.random;
    const w = this.width;
    const h = this.height;
    const span = Math.min(w, h);
    const L = BODY.length * f.size * this.scale;
    const need = L * 0.8;
    const avoid = f.species === "silvercarp" ? this.jamOf(f) : 1;
    let best: Goal | null = null;
    let score = -Infinity;
    let room: Goal = { x: f.x, y: f.y };
    let roomClear = field.clearance(f.x * w, f.y * h);
    for (const s of this.spots(field, GOAL_SAMPLES)) {
      if (s.clear > roomClear) {
        roomClear = s.clear;
        room = s.goal;
      }
      if (s.clear < need) continue;
      const dx = (s.goal.x - f.x) * w;
      const dy = (s.goal.y - f.y) * h;
      const sc =
        -Math.abs(wrap(Math.atan2(dy, dx) - f.angle)) * 1.2 +
        (Math.min(Math.hypot(dx, dy), span * 0.6) / span) * 2 +
        r() * 0.6 -
        this.crowdOnPath(f, s.goal.x, s.goal.y) * 2.2 * avoid;
      if (sc > score) {
        score = sc;
        best = s.goal;
      }
    }
    f.goal = best ?? room;
    f.goalTime = 7 + r() * 12;
  }

  step(dt: number, speedFactor = 1): void {
    dt = clamp(dt, 0, 0.05);
    this.time += dt;
    const field = this.field;
    const pellet = BODY.length * this.scale;
    for (const p of this.food) {
      p.life -= dt;
      p.age += dt;
      p.claims = 0;
      const k = Math.exp(-dt * 1.8);
      p.vx *= k;
      p.vy *= k;
      const [px, py] = field.inside(
        p.x + (p.vx + Math.sin(this.time * 0.35 + p.drift) * 1.2) * dt,
        p.y + (p.vy + Math.cos(this.time * 0.29 + p.drift * 1.3) * 1.2) * dt,
        pellet,
      );
      p.x = px;
      p.y = py;
    }
    this.food = this.food.filter((p) => p.life > 0 && !p.eaten);
    const sdt = dt * clamp(speedFactor, 0.1, 3);
    const neighbours = this.allFish;
    for (const f of neighbours) {
      f.target = null;
      if (f.species === "silvercarp") continue;
      const s = f.size * this.scale;
      const mx = f.x * this.width + Math.cos(f.angle) * BODY.nose * s;
      const my = f.y * this.height + Math.sin(f.angle) * BODY.nose * s;
      const reach = Math.max(this.width, this.height) * f.appetite;
      let best: Food | null = null;
      let fd = Infinity;
      for (const p of this.food) {
        if (p.eaten) continue;
        const d = Math.hypot(p.x - mx, p.y - my);
        const score = d * (1 + 0.6 * p.claims);
        if (score < fd && d < reach && p.age > f.react + d / 650) {
          fd = score;
          best = p;
        }
      }
      if (best) {
        best.claims++;
        f.target = best;
      }
    }
    for (const f of neighbours) this.swim(f, sdt, field, neighbours);
    if (this.food.some((p) => p.eaten)) this.food = this.food.filter((p) => !p.eaten);
  }

  swim(f: Fish, dt: number, field: Field, neighbours: Fish[]): void {
    const w = this.width;
    const h = this.height;
    const s = f.size * this.scale;
    const L = BODY.length * s;
    const random = this.random;
    const silver = f.species === "silvercarp";
    const x = f.x * w;
    const y = f.y * h;
    const cos = Math.cos(f.angle);
    const sin = Math.sin(f.angle);
    const mx = x + cos * BODY.nose * s;
    const my = y + sin * BODY.nose * s;
    let food: Food | null = silver ? null : f.target;
    if (food && (food.eaten || food.life <= 0)) food = null;
    const fd = food ? Math.hypot(food.x - mx, food.y - my) : Infinity;
    f.checkT -= dt;
    if (f.checkT <= 0) {
      f.checkT = 2 + random() * 2;
      const moved = Math.hypot((f.x - f.checkX) * w, (f.y - f.checkY) * h);
      f.checkX = f.x;
      f.checkY = f.y;
      if (moved < L * 0.6 && f.flee <= 0 && f.rest <= 0 && !f.target && f.peck <= 0)
        this.escape(f, field);
    }
    let gx: number;
    let gy: number;
    let want: number;
    let turnGain = silver ? 3.5 : 2 * f.temper.turnKeen;
    let maxTurn = silver ? 2.4 : 1.3;
    const fleeing = f.flee > 0;
    f.flee = Math.max(0, f.flee - dt);
    if (fleeing && f.flee === 0) {
      f.wary = 1.2 + random() * 0.8;
      f.depthGoal = Math.min(0.95, f.depth + 0.25);
    }
    if (f.peck > 0) {
      f.peck -= dt;
      if (f.peck <= 0) f.depthGoal = f.temper.depthBand;
    }
    if (f.peckCd > 0) f.peckCd -= dt;
    if (f.wary > 0) f.wary -= dt;
    if (f.chaseCd > 0) f.chaseCd -= dt;
    if (f.flee > 0) {
      gx = Math.cos(f.fleeAngle);
      gy = Math.sin(f.fleeAngle);
      want = 2.6 * L;
      turnGain = 9;
      maxTurn = 7;
    } else if (food) {
      const dx = food.x - x;
      const dy = food.y - y;
      const d = Math.hypot(dx, dy) || 1;
      const err = Math.abs(wrap(Math.atan2(dy, dx) - f.angle));
      gx = dx / d;
      gy = dy / d;
      want =
        (clamp((fd / L) * 1.3, 0.25, 2.2) *
          L *
          Math.max(0.12, Math.cos(Math.min(err, Math.PI / 2)) ** 2)) /
        (1 + 0.7 * (food.claims - 1));
      if (d < BODY.nose * s * 1.15 && err > 0.6) {
        gx = cos;
        gy = sin;
        want = 0.7 * L;
      }
      turnGain = 4.5;
      maxTurn = 3.4;
      f.depthGoal = 0.04 + (f.seed % 8) * 0.05;
      if (fd < Math.max(6, 7 * s)) {
        food.eaten = true;
        f.eaten++;
        this.totalEaten++;
        this.events.push({ type: "eat", x: food.x, y: food.y, fish: f });
      }
    } else if (f.chase) {
      const t = f.chase;
      const dx = t.x * w + Math.cos(t.angle) * t.v * 0.3 - x;
      const dy = t.y * h + Math.sin(t.angle) * t.v * 0.3 - y;
      const d = Math.hypot(dx, dy) || 1;
      gx = dx / d;
      gy = dy / d;
      want = 1.7 * f.cruise * L;
      turnGain = 3;
      maxTurn = 2.2;
      f.chaseT -= dt;
      if (f.chaseT <= 0 || d > L * 6) {
        f.chase = null;
        f.chaseCd = 30 + random() * 20;
      }
    } else {
      f.goalTime -= dt;
      if (!f.goal || f.goalTime <= 0 || Math.hypot(f.goal.x * w - x, f.goal.y * h - y) < L * 1.3)
        this.pickGoal(f, field);
      const goal = f.goal!;
      const a =
        Math.atan2(goal.y * h - y, goal.x * w - x) +
        (Math.sin(this.time * 0.21 + f.seed) * 0.45 +
          Math.sin(this.time * 0.53 + f.seed * 1.7) * 0.2) *
          f.temper.wanderAmp;
      gx = Math.cos(a);
      gy = Math.sin(a);
      f.rest = Math.max(0, f.rest - dt);
      if (f.peck <= 0 && f.rest <= 0 && random() < dt * 0.02 * f.temper.restRate)
        f.rest = silver ? 0.6 + random() * 1.2 : 2 + random() * 4;
      want = f.cruise * L * (f.rest > 0 ? 0.12 : 1);
      if (f.peck > 0) {
        want *= 0.4;
        f.depthGoal = 0.97;
      } else {
        if (f.peckCd <= 0 && random() < dt * 0.012 * f.temper.restRate) {
          f.peck = 1.2 + random() * 0.8;
          f.peckCd = 20 + random() * 15;
          f.depthGoal = 0.97;
        }
        if (
          f.chase === null &&
          f.chaseCd <= 0 &&
          f.rest <= 0 &&
          field.clearance(x, y) > L * 2 &&
          random() < dt * 0.006
        ) {
          const reach = Math.max(w, h) * 0.45;
          let best: Fish | null = null;
          let bd = Infinity;
          for (const o of neighbours) {
            if (
              o === f ||
              o.species !== f.species ||
              o.chase !== null ||
              o.rest > 0 ||
              o.flee > 0 ||
              f.size / o.size > 1.5 ||
              o.size / f.size > 1.5
            )
              continue;
            const d = Math.hypot((o.x - f.x) * w, (o.y - f.y) * h);
            if (
              d < bd &&
              d < reach &&
              field.clearance(o.x * w, o.y * h) > BODY.length * o.size * this.scale * 2
            ) {
              bd = d;
              best = o;
            }
          }
          if (best && bd < L * 6) {
            f.chase = best;
            f.chaseT = 1.5 + random() * 1.5;
            const away = Math.atan2((best.y - f.y) * h, (best.x - f.x) * w);
            const esc = scanHeading(
              field,
              best.x * w,
              best.y * h,
              away,
              BODY.length * best.size * this.scale,
              handed(best.seed),
            );
            best.flee = 0.5;
            best.fleeAngle = esc.block > 0 ? Math.atan2(esc.y, esc.x) : away;
          }
        }
        if (f.wary <= 0 && random() < dt * 0.03)
          f.depthGoal = silver
            ? 0.18 + random() * 0.4
            : clamp(f.temper.depthBand + (random() - 0.5) * 0.4, 0.05, 0.95);
      }
    }
    let ax = 0;
    let ay = 0;
    let cx = 0;
    let cy = 0;
    let companions = 0;
    let crowdN = 0;
    for (const o of neighbours) {
      if (o === f) continue;
      const ox = o.x * w - x;
      const oy = o.y * h - y;
      const d = Math.hypot(ox, oy);
      if (d < 1e-6) continue;
      if (d < L * 2) crowdN++;
      if (!food && d < L * 2.5 && o.species === f.species) {
        ax += Math.cos(o.angle);
        ay += Math.sin(o.angle);
      }
      if (silver && o.species === f.species && d < L * 5 && field.clearance(o.x * w, o.y * h) > L) {
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
    const head = scanHeading(field, x, y, f.angle, L, handed(f.seed));
    const block = head.block;
    if (f.wary > 0) want *= block < 0.4 ? 1.25 : 0.45;
    if (f.flee > 0) {
      if (block > 0.5) f.flee = Math.min(f.flee, 0.08);
      want *= block < 0.4 ? 1 : 0.5;
    }
    if (f.chase !== null && block > 0.5) {
      f.chase = null;
      f.chaseCd = 30 + random() * 20;
    }
    const tx = gx + ax * 0.15;
    const ty = gy + ay * 0.15;
    const tl = Math.hypot(tx, ty) || 1;
    const desired = Math.atan2(
      (ty / tl) * (1 - block) + head.y * block,
      (tx / tl) * (1 - block) + head.x * block,
    );
    turnGain += block * 6;
    maxTurn *= 1 + 2.2 * block;
    want *= 1 - 0.6 * block;
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
        Math.min(0.4, Math.abs(f.turn) * 0.25) +
        (f.wary > 0 ? 0.1 : 0) -
        f.amp) *
      Math.min(1, dt * 3);
    const [px, py] = field.inside(
      x + Math.cos(f.angle) * f.v * dt,
      y + Math.sin(f.angle) * f.v * dt,
      L,
    );
    f.x = px / w;
    f.y = py / h;
    if (f.flee <= 0 && !food && f.peck <= 0 && crowdN >= 2 && random() < dt * 0.5)
      f.depthGoal = 0.05 + random() * 0.9;
    f.depth +=
      (f.depthGoal - f.depth) *
      Math.min(1, dt * (food ? 1.2 : f.peck > 0 ? 2.4 : crowdN >= 2 ? 0.9 : 0.35));
    updateSpine(f, s, w, h);
  }
}
