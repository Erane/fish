import { clamp, TAU, wrap } from "../core/index.ts";
import type { Obstacle, Settings } from "../core/types.ts";
import type { BedShape } from "../render/bedShapes.ts";
import type { Look, Renderer, Vec4 } from "../render/types.ts";
import { absorption } from "./look.ts";
import { budAnchors, crabHomes, obstacleAnchors, spotAnchors } from "./anchors.ts";
import { BUTTERFLY_COUNT, CRAB_COUNT, TURTLE_COUNT } from "../art/creatures.ts";

type Rnd = () => number;
type Stir = (x: number, y: number, r: number, s: number) => void;

export class Turtle {
  readonly variant: number;
  private readonly rnd: Rnd;
  x: number;
  y: number;
  depth: number;
  private angle: number;
  private v = 0;
  private turn = 0;
  private stroke: number;
  private depthGoal: number;
  private goal: [number, number] | null = null;
  private goalTime = 0;
  private rest: number;
  private breath: number;
  private surfaced = 0;
  private look = 0;
  private lookGoal = 0;
  private neck = 1;
  private readonly size: number;
  private bubble = 0;

  constructor(variant: number, rnd: Rnd) {
    this.variant = variant;
    this.rnd = rnd;
    this.x = 0.25 + rnd() * 0.5;
    this.y = 0.3 + rnd() * 0.45;
    this.angle = rnd() * TAU;
    this.stroke = rnd() * TAU;
    this.depth = 0.5;
    this.depthGoal = 0.5;
    this.rest = 2 + rnd() * 4;
    this.breath = 20 + rnd() * 30;
    this.size = 1.08 + rnd() * 0.14;
  }

  private headPos(w: number, h: number, scale: number): [number, number] {
    const s = scale * this.size;
    const d = (20 + 10 * this.neck) * s;
    return [this.x * w + Math.cos(this.angle) * d, this.y * h + Math.sin(this.angle) * d];
  }

  update(
    dt: number,
    w: number,
    h: number,
    scale: number,
    time: number,
    stir: Stir,
    others: Turtle[],
  ): void {
    const r = this.rnd;
    const s = scale * this.size;
    const L = 60 * s;
    const x = this.x * w;
    const y = this.y * h;
    this.breath -= dt;
    if (this.breath <= 0 && this.surfaced <= 0) {
      this.depthGoal = 0;
      if (this.depth < 0.05) {
        this.surfaced = 4 + r() * 4;
        this.breath = 40 + r() * 40;
        const [hx, hy] = this.headPos(w, h, scale);
        stir(hx, hy, 6 * scale, 0.45);
      }
    }
    if (this.surfaced > 0) {
      this.surfaced -= dt;
      this.bubble -= dt;
      if (this.bubble <= 0) {
        this.bubble = 0.8 + r() * 1.4;
        const [hx, hy] = this.headPos(w, h, scale);
        stir(hx, hy, 3.5 * scale, 0.12);
      }
      if (this.surfaced <= 0) {
        this.depthGoal = 0.4 + r() * 0.35;
        stir(x, y, 12 * scale, 0.35);
      }
    }
    this.rest -= dt;
    if (this.rest < -8 - r() * 10) this.rest = 3 + r() * 6;
    const resting = this.rest > 0 || this.surfaced > 0;
    this.goalTime -= dt;
    if (
      !this.goal ||
      this.goalTime <= 0 ||
      Math.hypot(this.goal[0] * w - x, this.goal[1] * h - y) < L
    ) {
      this.goal = [0.18 + r() * 0.64, 0.2 + r() * 0.6];
      this.goalTime = 15 + r() * 15;
    }
    let gx = this.goal[0] * w - x;
    let gy = this.goal[1] * h - y;
    const m = Math.min(w, h) * 0.1;
    const lx = x + Math.cos(this.angle) * L;
    const ly = y + Math.sin(this.angle) * L;
    if (lx < m || lx > w - m) gx += (w / 2 - x) * 2;
    if (ly < m || ly > h - m) gy += (h / 2 - y) * 2;
    for (const o of others) {
      if (o === this) continue;
      const dx = x - o.x * w;
      const dy = y - o.y * h;
      const d = Math.hypot(dx, dy);
      if (d < L * 1.3 && d > 0) {
        gx += (dx / d) * L * 3;
        gy += (dy / d) * L * 3;
      }
    }
    const want = Math.atan2(gy, gx) + Math.sin(time * 0.13 + this.variant * 3) * 0.3;
    this.turn +=
      (clamp(wrap(want - this.angle) * 0.8, -0.45, 0.45) * (resting ? 0.15 : 1) - this.turn) *
      Math.min(1, dt * 2);
    this.angle = wrap(this.angle + this.turn * dt);
    const rate = resting ? 0.12 : 0.62;
    this.stroke += dt * TAU * rate;
    this.v += Math.max(0, Math.sin(this.stroke)) * (resting ? 0 : L * 0.5) * dt;
    this.v *= Math.exp(-dt * 0.9);
    const nx = x + Math.cos(this.angle) * this.v * dt;
    const ny = y + Math.sin(this.angle) * this.v * dt;
    this.x = clamp(nx / w, 0.05, 0.95);
    this.y = clamp(ny / h, 0.06, 0.94);
    this.depth += (this.depthGoal - this.depth) * Math.min(1, dt * 0.45);
    if (r() < dt * 0.25) this.lookGoal = (r() - 0.5) * (resting ? 1.1 : 0.5);
    this.look += (this.lookGoal - this.look) * Math.min(1, dt * 1.5);
    this.neck +=
      ((this.surfaced > 0 ? 1.25 : resting ? 0.75 : 1) - this.neck) * Math.min(1, dt * 1.5);
  }

  draw(R: Renderer, w: number, h: number, scale: number, look: Look, col: number): void {
    const S = R.sprites;
    const v = this.variant;
    const s = scale * this.size * (1 + (0.5 - this.depth) * 0.08);
    const x = this.x * w;
    const y = this.y * h;
    const a = this.angle;
    const c = Math.cos(a);
    const si = Math.sin(a);
    const abs = absorption(col);
    const fog: Vec4 = [look.water[0], look.water[1], look.water[2], 0.03 + col * 0.3];
    const off = (6 + (1 - this.depth) * 26) * scale;
    const dx = look.shadowDir[0] * off;
    const dy = look.shadowDir[1] * off;
    const sh: Vec4 = [0, 0, 0, 0.86 - (1 - this.depth) * 0.2];
    const blur: Vec4 = [(1 - this.depth) * 1.1 + col * 0.45, 0, 0, 0];
    const body: Vec4 = [abs[0], abs[1], abs[2], 1];
    const part = (name: string, lx: number, ly: number, ang: number, flip: boolean): void => {
      const px = x + (lx * c - ly * si) * s;
      const py = y + (lx * si + ly * c) * s;
      const def = S[`turtle${v}_${name}`]!;
      R.sprite("under", def, px, py, a + ang, s, flip ? -s : s, body, fog);
      R.sprite("shadow", def, px + dx, py + dy, a + ang, s, flip ? -s : s, sh, blur);
    };
    const swim = this.rest > 0 || this.surfaced > 0 ? 0.25 : 1;
    const st = this.stroke;
    for (const side of [1, -1]) {
      const ph = side > 0 ? 0 : Math.PI;
      part(
        "back",
        -13,
        side * 11,
        side * (2.3 + Math.sin(st + ph + Math.PI) * 0.38 * swim),
        side < 0,
      );
      part(
        "front",
        11,
        side * 12.8,
        side * (0.85 + (0.5 - 0.5 * Math.cos(st + ph)) * 0.95 * swim),
        side < 0,
      );
    }
    part("tail", -20.5, 0, Math.PI + Math.sin(st * 0.5) * 0.25, false);
    part("head", 16 + 3.5 * this.neck, 0, this.look, false);
    part("shell", 0, 0, 0, false);
  }
}

interface Spot {
  x: number;
  y: number;
  land: boolean;
}

class Butterfly {
  private readonly species: number;
  private readonly rnd: Rnd;
  x = -1;
  y = -1;
  private vx = 0;
  private vy = 0;
  private heading: number;
  private alt = 0.8;
  private flap = 0;
  private phase: number;
  private state: "fly" | "rest" = "fly";
  private target: Spot | null = null;
  private timer = 0;
  private glide = 0;
  private wander: number;
  private open = 0.5;

  constructor(species: number, rnd: Rnd) {
    this.species = species;
    this.rnd = rnd;
    this.heading = rnd() * TAU;
    this.phase = rnd() * TAU;
    this.wander = rnd() * TAU;
  }

  private pickTarget(w: number, h: number, spots: [number, number][]): void {
    const r = this.rnd;
    if (spots.length && r() < 0.45) {
      const s = spots[Math.floor(r() * spots.length)]!;
      this.target = { x: s[0] + (r() - 0.5) * 8, y: s[1] + (r() - 0.5) * 8, land: true };
    } else this.target = { x: w * (0.12 + r() * 0.76), y: h * (0.14 + r() * 0.72), land: false };
    this.timer = 6 + r() * 8;
  }

  update(
    dt: number,
    w: number,
    h: number,
    scale: number,
    spots: [number, number][],
    time: number,
  ): void {
    const r = this.rnd;
    if (!this.target) this.pickTarget(w, h, spots);
    if (this.state === "rest") {
      this.timer -= dt;
      this.alt += (0 - this.alt) * Math.min(1, dt * 3);
      this.open +=
        ((Math.sin(time * 1.3 + this.phase) > -0.2 ? 0.05 : 1.2) - this.open) *
        Math.min(1, dt * 1.8);
      this.flap = this.open;
      this.heading += Math.sin(time * 0.7 + this.phase) * dt * 0.15;
      if (this.timer <= 0) {
        this.state = "fly";
        this.pickTarget(w, h, spots);
        this.vy -= 30;
      }
      return;
    }
    const t = this.target!;
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    this.timer -= dt;
    if (t.land && d < 10) {
      this.state = "rest";
      this.timer = 4 + r() * 8;
      this.vx = this.vy = 0;
      return;
    }
    if ((!t.land && d < 40) || this.timer <= 0) this.pickTarget(w, h, spots);
    this.wander += (r() - 0.5) * dt * 9;
    const sp = (t.land ? clamp(d / 70, 0.35, 1) : 1) * 95 * scale;
    const ax = (dx / (d || 1)) * sp + Math.cos(this.wander) * 45 * scale;
    const ay = (dy / (d || 1)) * sp + Math.sin(this.wander) * 45 * scale;
    this.vx += (ax - this.vx) * Math.min(1, dt * 2.2);
    this.vy += (ay - this.vy) * Math.min(1, dt * 2.2);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const want = Math.atan2(this.vy, this.vx);
    this.heading += clamp(wrap(want - this.heading), -dt * 6, dt * 6);
    this.glide -= dt;
    if (this.glide <= 0 && r() < dt * 0.35) this.glide = 0.25 + r() * 0.45;
    if (this.glide > 0) this.flap += (0.05 - this.flap) * Math.min(1, dt * 10);
    else {
      this.phase += dt * TAU * (this.species === 2 ? 6.5 : 9);
      const s = 0.5 + 0.5 * Math.sin(this.phase);
      this.flap = -0.12 + 1.45 * Math.pow(s, 0.7);
    }
    const altGoal = t.land
      ? clamp(d / 120, 0.05, 0.8)
      : 0.75 + 0.12 * Math.sin(time * 1.1 + this.phase * 0.1);
    this.alt += (altGoal - this.alt) * Math.min(1, dt * 1.5);
    this.x = clamp(this.x, -20, w + 20);
    this.y = clamp(this.y, -20, h + 20);
  }

  reposition(w: number, h: number, prevW: number, prevH: number, rnd: Rnd): void {
    if (this.x < 0) {
      this.x = rnd() * w;
      this.y = rnd() * h;
    } else {
      this.x *= w / prevW;
      this.y *= h / prevH;
    }
    this.target = null;
    this.state = "fly";
  }

  draw(R: Renderer, scale: number, look: Look): void {
    const S = R.sprites;
    const s = scale * 0.55 * (0.9 + this.alt * 0.35);
    const a = this.heading + Math.PI / 2;
    const wing = S[`bf${this.species}_wing`]!;
    const body = S[`bf${this.species}_body`]!;
    const k = Math.cos(clamp(this.flap, -0.3, 1.5));
    const shade = 0.82 + 0.18 * k;
    const col: Vec4 = [shade, shade, shade, 1];
    const bob = this.state === "rest" ? 0 : Math.sin(this.phase) * 1.2;
    const off = (3 + this.alt * 70) * scale;
    const dx = look.shadowDir[0] * off;
    const dy = look.shadowDir[1] * off + bob;
    const sa: Vec4 = [0, 0, 0, (0.28 - this.alt * 0.12) * look.shadow * 2];
    for (const side of [1, -1]) {
      R.sprite("airShadow", wing, this.x + dx, this.y + dy, a, side * s * Math.max(0.08, k), s, sa);
      R.sprite("air", wing, this.x, this.y + bob, a, side * s * Math.max(0.06, k), s, col);
    }
    R.sprite("airShadow", body, this.x + dx, this.y + dy, a, s * 0.9, s * 0.9, sa);
    R.sprite("air", body, this.x, this.y + bob, a, s * 0.9, s * 0.9);
  }
}

type DfState = "hover" | "rest" | "dart" | "dip" | "perch";

class Dragonfly {
  private readonly species: number;
  private readonly rnd: Rnd;
  x = -1;
  y = -1;
  private vx = 0;
  private vy = 0;
  private heading: number;
  private alt = 0.7;
  private state: DfState = "hover";
  private timer = 1;
  private target: Spot | null = null;
  private flap = 0;
  private touched = false;

  constructor(species: number, rnd: Rnd) {
    this.species = species;
    this.rnd = rnd;
    this.heading = rnd() * TAU;
  }

  reset(): void {
    this.x = -1;
    this.state = "hover";
    this.timer = 1;
  }

  private choose(w: number, h: number, scale: number, perches: [number, number][]): void {
    const r = this.rnd;
    const roll = r();
    const a = r() * TAU;
    if (roll < 0.22 && perches.length) {
      const p = perches[Math.floor(r() * perches.length)]!;
      this.state = "perch";
      this.target = { x: p[0], y: p[1], land: true };
      this.timer = 4 + r() * 9;
    } else if (roll < 0.45) {
      const d = (50 + r() * 130) * scale;
      this.state = "dip";
      this.touched = false;
      this.target = {
        x: clamp(this.x + Math.cos(a) * d, w * 0.15, w * 0.85),
        y: clamp(this.y + Math.sin(a) * d, h * 0.15, h * 0.85),
        land: false,
      };
    } else {
      const d = (120 + r() * 260) * scale;
      this.state = "dart";
      this.target = {
        x: clamp(this.x + Math.cos(a) * d, w * 0.08, w * 0.92),
        y: clamp(this.y + Math.sin(a) * d, h * 0.1, h * 0.9),
        land: false,
      };
    }
  }

  update(
    dt: number,
    w: number,
    h: number,
    scale: number,
    perches: [number, number][],
    time: number,
    stir: Stir,
  ): void {
    const r = this.rnd;
    if (this.x < 0) {
      this.x = w * (0.2 + r() * 0.6);
      this.y = h * (0.2 + r() * 0.6);
    }
    this.flap += dt;
    if (this.state === "hover" || this.state === "rest") {
      this.timer -= dt;
      this.vx *= Math.exp(-dt * 6);
      this.vy *= Math.exp(-dt * 6);
      if (this.state === "hover") {
        this.x += this.vx * dt + Math.sin(time * 2.3 + this.species) * 5 * scale * dt;
        this.y += this.vy * dt + Math.cos(time * 3.1) * 4 * scale * dt;
        this.alt += (0.6 - this.alt) * Math.min(1, dt * 2);
      }
      if (this.timer <= 0) this.choose(w, h, scale, perches);
      return;
    }
    const t = this.target!;
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    const want = Math.min((this.state === "dart" ? 320 : 170) * scale, d * 5);
    this.vx += ((dx / (d || 1)) * want - this.vx) * Math.min(1, dt * 8);
    this.vy += ((dy / (d || 1)) * want - this.vy) * Math.min(1, dt * 8);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (d > 4) this.heading += clamp(wrap(Math.atan2(dy, dx) - this.heading), -dt * 14, dt * 14);
    if (this.state === "dip") {
      this.alt += ((d < 25 * scale ? 0.02 : 0.45) - this.alt) * Math.min(1, dt * 5);
      if (d < 4 && !this.touched) {
        this.touched = true;
        stir(this.x, this.y, 3.5 * scale, 0.5);
        this.state = "hover";
        this.timer = 0.4 + r() * 0.8;
      }
    } else if (this.state === "perch") {
      this.alt += ((d < 30 * scale ? 0 : 0.5) - this.alt) * Math.min(1, dt * 3);
      if (d < 2) {
        this.state = "rest";
        this.vx = this.vy = 0;
        this.alt = 0;
      }
    } else {
      this.alt += (0.7 - this.alt) * Math.min(1, dt * 2);
      if (d < 6) {
        this.state = "hover";
        this.timer = 0.5 + r() * 2.2;
      }
    }
  }

  draw(R: Renderer, scale: number, look: Look): void {
    const S = R.sprites;
    const s = scale * 0.7 * (0.9 + this.alt * 0.3);
    const wing = S[`df${this.species}_wing`]!;
    const body = S[`df${this.species}_body`]!;
    const c = Math.cos(this.heading);
    const si = Math.sin(this.heading);
    const off = (3 + this.alt * 60) * scale;
    const dx = look.shadowDir[0] * off;
    const dy = look.shadowDir[1] * off;
    const sa: Vec4 = [0, 0, 0, (0.3 - this.alt * 0.12) * look.shadow * 2];
    const resting = this.state === "rest";
    for (const [fwd, sweep] of [
      [1.2, -0.16],
      [-0.6, 0.2],
    ])
      for (const side of [1, -1]) {
        const x = this.x + c * fwd * s;
        const y = this.y + si * fwd * s;
        const ang = this.heading + side * (Math.PI / 2 + sweep);
        R.sprite("airShadow", wing, x + dx, y + dy, ang, s, side * s, sa);
        if (resting) R.sprite("air", wing, x, y, ang, s, side * s, [1, 1, 1, 0.95]);
        else
          for (const k of [-1, 1])
            R.sprite(
              "air",
              wing,
              x,
              y,
              ang + side * k * 0.18,
              s * (0.8 + 0.2 * Math.sin(this.flap * 60 + k)),
              side * s,
              [1, 1, 1, 0.45],
            );
      }
    R.sprite("airShadow", body, this.x + dx, this.y + dy, this.heading + Math.PI / 2, s, s, sa);
    R.sprite("air", body, this.x, this.y, this.heading + Math.PI / 2, s, s);
  }
}

interface HomePx {
  hx: number;
  hy: number;
  rx: number;
  ry: number;
}

type CrabState = "hidden" | "idle" | "walk" | "flee" | "dive";

class Crab {
  private readonly variant: number;
  private readonly rnd: Rnd;
  home = 0;
  private u = 0;
  private v = 0;
  private heading: number;
  state: CrabState = "hidden";
  private timer: number;
  private walk = 0;
  private speed = 0;
  private target: [number, number] | null = null;
  private alpha = 0;
  private waveT = 0;
  private readonly size: number;
  x = 0;
  y = 0;

  constructor(variant: number, rnd: Rnd) {
    this.variant = variant;
    this.rnd = rnd;
    this.heading = rnd() * TAU;
    this.timer = 1 + rnd() * 6;
    this.size = 0.85 + rnd() * 0.35;
  }

  private at(R: Renderer, homes: HomePx[], u: number, v: number): [number, number] {
    const hp = homes[this.home]!;
    return R.imageToScreen(hp.hx + u * hp.rx, hp.hy + v * hp.ry);
  }

  private emerge(homes: HomePx[], taken: number[]): void {
    const free = homes.map((_, i) => i).filter((i) => !taken.includes(i));
    const pool = free.length ? free : homes.map((_, i) => i);
    const r = this.rnd;
    this.home = pool[Math.floor(r() * pool.length)]!;
    const a = r() * TAU;
    const d = Math.sqrt(r()) * 0.7;
    this.u = Math.cos(a) * d;
    this.v = Math.sin(a) * d;
    this.state = "idle";
    this.timer = 1 + r() * 3;
    this.alpha = 0;
  }

  startle(x: number, y: number, radius: number): void {
    if (
      this.state === "hidden" ||
      this.state === "dive" ||
      Math.hypot(this.x - x, this.y - y) > radius
    )
      return;
    const a = Math.atan2(this.y - y, this.x - x);
    this.state = "flee";
    this.target = [Math.cos(a) * 1.05, Math.sin(a) * 1.05];
    this.timer = 2;
  }

  hide(): void {
    this.state = "hidden";
    this.timer = 1 + this.rnd() * 5;
  }

  update(
    dt: number,
    R: Renderer,
    scale: number,
    k: number,
    homes: HomePx[],
    allowed: boolean,
    stir: Stir,
    taken: number[],
  ): void {
    const r = this.rnd;
    if (!allowed && this.state !== "hidden" && this.state !== "dive") {
      this.state = "flee";
      this.target = [this.u * 1.6 + 0.01, this.v * 1.6];
      this.timer = 2;
    }
    if (this.state === "hidden") {
      this.timer -= dt;
      if (this.timer <= 0 && allowed && homes.length) this.emerge(homes, taken);
      return;
    }
    if (this.state === "dive") {
      this.alpha -= dt * 1.6;
      if (this.alpha <= 0) {
        this.state = "hidden";
        this.timer = 12 + r() * 25;
      }
      return;
    }
    this.alpha = Math.min(1, this.alpha + dt * 1.2);
    const hp = homes[this.home]!;
    const rx = hp.rx;
    const ry = hp.ry;
    if (this.state === "idle") {
      this.timer -= dt;
      this.speed *= Math.exp(-dt * 8);
      if (this.waveT <= 0 && r() < dt * 0.12) this.waveT = 1.2;
      if (this.timer <= 0) {
        if (r() < 0.1) {
          this.state = "flee";
          const a = r() * TAU;
          this.target = [Math.cos(a) * 1.05, Math.sin(a) * 1.05];
        } else {
          const a = r() * TAU;
          const d = Math.sqrt(r()) * 0.8;
          this.target = [Math.cos(a) * d, Math.sin(a) * d];
          this.state = "walk";
          this.timer = 6;
        }
      }
    }
    if ((this.state === "walk" || this.state === "flee") && this.target) {
      const [x0, y0] = this.at(R, homes, this.u, this.v);
      const [x1, y1] = this.at(R, homes, this.target[0], this.target[1]);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const d = Math.hypot(dx, dy);
      const dir = Math.atan2(dy, dx);
      const want = [dir - Math.PI / 2, dir + Math.PI / 2].sort(
        (a, b) => Math.abs(wrap(a - this.heading)) - Math.abs(wrap(b - this.heading)),
      )[0]!;
      this.heading += clamp(wrap(want - this.heading), -dt * 2.4, dt * 2.4);
      const go = (this.state === "flee" ? 80 : 24) * scale * this.size;
      const aligned = Math.abs(wrap(want - this.heading)) < 0.6 ? 1 : 0.25;
      this.speed += (go * aligned - this.speed) * Math.min(1, dt * 6);
      const step = Math.min(d, this.speed * dt);
      if (d > 0.5) {
        this.u += ((dx / d) * step) / (rx * k);
        this.v += ((dy / d) * step) / (ry * k);
      }
      this.walk += (this.speed * dt) / (3.6 * scale);
      this.timer -= dt;
      if (d < 1.5 || this.timer <= 0) {
        if (this.state === "flee") {
          this.state = "dive";
          const [x, y] = this.at(R, homes, this.u, this.v);
          stir(x, y, 4 * scale, 0.3);
        } else {
          this.state = "idle";
          this.timer = 2 + r() * 7;
        }
      }
    }
    if (this.waveT > 0) this.waveT -= dt;
    [this.x, this.y] = this.at(R, homes, this.u, this.v);
  }

  draw(R: Renderer, scale: number, look: Look): void {
    if (this.state === "hidden" || this.alpha <= 0) return;
    const S = R.sprites;
    const v = this.variant;
    const s = scale * 1.05 * this.size;
    const a = this.heading;
    const c = Math.cos(a);
    const si = Math.sin(a);
    const A = this.alpha;
    const lit: Vec4 = [
      look.bright * look.tint[0] * A,
      look.bright * look.tint[1] * A,
      look.bright * look.tint[2] * A,
      A,
    ];
    const at = (lx: number, ly: number): [number, number] => [
      this.x + (lx * c - ly * si) * s,
      this.y + (lx * si + ly * c) * s,
    ];
    const moving = this.speed > 2 * scale;
    const sh: Vec4 = [0, 0, 0, 0.34 * A];
    const od = 3.4 * scale;
    R.sprite(
      "surface",
      S[`crab${v}_body`]!,
      this.x + look.shadowDir[0] * od,
      this.y + look.shadowDir[1] * od,
      a,
      s * 1.08,
      s * 1.08,
      sh,
    );
    for (const side of [1, -1])
      for (let i = 0; i < 4; i++) {
        const [px, py] = at(1.9 - i * 1.35, side * 3.6);
        const swing = moving
          ? Math.sin(this.walk + (i % 2) * Math.PI + (side > 0 ? 0 : Math.PI / 2)) * 0.32
          : Math.sin(scale + i) * 0.03;
        const ang = a + side * (Math.PI / 2 + (i - 1.3) * 0.36 + swing);
        R.sprite(
          "surface",
          S[`crab${v}_leg`]!,
          px + look.shadowDir[0] * od * 0.6,
          py + look.shadowDir[1] * od * 0.6,
          ang,
          s,
          side * s,
          [0, 0, 0, 0.22 * A],
        );
        R.sprite("surface", S[`crab${v}_leg`]!, px, py, ang, s, side * s, lit);
      }
    for (const side of [1, -1]) {
      const [px, py] = at(4.4, side * 2.5);
      const raise =
        side > 0 && this.waveT > 0
          ? Math.sin((1.2 - this.waveT) * 9) * 0.5 * Math.min(1, this.waveT * 3)
          : 0;
      R.sprite(
        "surface",
        S[`crab${v}_claw`]!,
        px,
        py,
        a + side * (0.55 + raise),
        s * (1 + Math.abs(raise) * 0.15),
        side * s,
        lit,
      );
    }
    R.sprite("surface", S[`crab${v}_body`]!, this.x, this.y, a, s, s, lit);
  }
}

interface Firefly {
  x: number;
  y: number;
  a: number;
  p: number;
  s: number;
}

export class Creatures {
  private readonly R: Renderer;
  private readonly rnd: Rnd;
  private readonly stir: Stir;
  private readonly bedW: number;
  private readonly bedH: number;
  private readonly m: number;
  private readonly shapes: BedShape[];
  readonly turtles: Turtle[];
  private readonly butterflies: Butterfly[];
  private readonly dragonflies: Dragonfly[];
  private readonly crabs: Crab[];
  private flies: Firefly[] = [];
  private homes: HomePx[] = [];
  private spots: [number, number][] = [];
  private buds: [number, number][] = [];
  private k = 1;
  private w = 1;
  private h = 1;
  private scale = 1;
  private prevW = 1;
  private prevH = 1;
  private showCrabs = false;
  private flying = false;
  private dragonflyOn = false;

  constructor(
    R: Renderer,
    shapes: BedShape[],
    bedW: number,
    bedH: number,
    stir: Stir,
    rnd: Rnd = Math.random,
  ) {
    this.R = R;
    this.rnd = rnd;
    this.stir = stir;
    this.bedW = bedW;
    this.bedH = bedH;
    this.m = Math.min(bedW, bedH);
    this.shapes = shapes;
    this.turtles = [0, 1].map((v) => new Turtle(v % TURTLE_COUNT, rnd));
    this.butterflies = [0, 1, 2].map((s) => new Butterfly(s % BUTTERFLY_COUNT, rnd));
    this.dragonflies = [new Dragonfly(rnd() < 0.7 ? 0 : 1, rnd)];
    this.crabs = [0, 1, 0].map((v) => new Crab(v % CRAB_COUNT, rnd));
  }

  layout(w: number, h: number, scale: number): Obstacle[] {
    const R = this.R;
    this.w = w;
    this.h = h;
    this.scale = scale;
    const [x0, y0] = R.imageToScreen(0, 0);
    const [x1, y1] = R.imageToScreen(1, 0);
    this.k = Math.hypot(x1 - x0, y1 - y0);
    const inside = (p: [number, number]): boolean =>
      p[0] > 20 && p[0] < w - 20 && p[1] > 20 && p[1] < h - 20;
    this.spots = spotAnchors(this.shapes)
      .map(([x, y]) => R.imageToScreen(x * this.bedW, y * this.bedH))
      .filter(inside);
    this.buds = budAnchors(this.shapes)
      .map(([x, y]) => R.imageToScreen(x * this.bedW, y * this.bedH))
      .filter(inside);
    this.homes = crabHomes(this.shapes)
      .map((c) => ({
        hx: c.x * this.bedW,
        hy: c.y * this.bedH,
        rx: c.rx * this.m,
        ry: c.ry * this.m,
      }))
      .filter((hp) => {
        const [sx, sy] = R.imageToScreen(hp.hx, hp.hy);
        return sx > 30 && sx < w - 30 && sy > 30 && sy < h - 30;
      });
    for (const c of this.crabs) if (c.home >= this.homes.length) c.hide();
    for (const d of this.dragonflies) d.reset();
    for (const b of this.butterflies) b.reposition(w, h, this.prevW, this.prevH, this.rnd);
    this.prevW = w;
    this.prevH = h;
    const obstacles: Obstacle[] = [];
    for (const a of obstacleAnchors(this.shapes)) {
      const [sx, sy] = R.imageToScreen(a.x * this.bedW, a.y * this.bedH);
      obstacles.push({ x: sx, y: sy, r: a.r * this.m * this.k });
    }
    return obstacles;
  }

  startle(x: number, y: number): void {
    for (const c of this.crabs) c.startle(x, y, 130 * this.scale);
  }

  update(dt: number, settings: Settings, time: number): void {
    const { w, h, scale } = this;
    const weather = settings.weather;
    const night = settings.night;
    if (settings.turtles)
      for (const t of this.turtles) t.update(dt, w, h, scale, time, this.stir, this.turtles);
    this.showCrabs = settings.crabs;
    const allowed = settings.crabs && weather !== "snow";
    if (this.homes.length) {
      for (const c of this.crabs) {
        const taken = this.crabs.filter((o) => o !== c && o.state !== "hidden").map((o) => o.home);
        c.update(dt, this.R, scale, this.k, this.homes, allowed, this.stir, taken);
      }
    } else for (const c of this.crabs) c.hide();
    this.flying = settings.butterflies && weather === "sunny" && !night;
    if (this.flying) for (const b of this.butterflies) b.update(dt, w, h, scale, this.spots, time);
    this.dragonflyOn =
      settings.butterflies && !night && (weather === "sunny" || weather === "cloudy");
    const perches = this.buds.length ? this.buds : this.spots;
    if (this.dragonflyOn)
      for (const d of this.dragonflies) d.update(dt, w, h, scale, perches, time, this.stir);
    const wantFlies = settings.butterflies && night && weather !== "rain" ? 14 : 0;
    while (this.flies.length < wantFlies)
      this.flies.push({
        x: this.rnd() * w,
        y: this.rnd() * h,
        a: this.rnd() * TAU,
        p: this.rnd() * TAU,
        s: 0.7 + this.rnd() * 0.6,
      });
    if (this.flies.length > wantFlies) this.flies.length = wantFlies;
    for (const f of this.flies) {
      f.a += (this.rnd() - 0.5) * dt * 2;
      f.x += Math.cos(f.a) * 14 * dt;
      f.y += Math.sin(f.a) * 14 * dt;
      f.p += dt;
      if (f.x < 0 || f.x > w || f.y < 0 || f.y > h) f.a += Math.PI;
    }
  }

  drawTurtle(t: Turtle, col: number, look: Look): void {
    t.draw(this.R, this.w, this.h, this.scale, look, col);
  }

  drawSurface(look: Look): void {
    if (!this.showCrabs) return;
    for (const c of this.crabs) c.draw(this.R, this.scale, look);
  }

  drawAir(look: Look): void {
    if (this.flying) for (const b of this.butterflies) b.draw(this.R, this.scale, look);
    if (this.dragonflyOn) for (const d of this.dragonflies) d.draw(this.R, this.scale, look);
    const dot = this.R.sprites.dot!;
    for (const f of this.flies) {
      const glow = Math.pow(Math.max(0, Math.sin(f.p * 1.3 * f.s)), 3);
      this.R.sprite("glow", dot, f.x, f.y, 0, 0.9 * f.s, 0.9 * f.s, [
        0.75 * glow,
        glow,
        0.45 * glow,
        1,
      ]);
      this.R.sprite("glow", dot, f.x, f.y, 0, 0.25, 0.25, [0.9 * glow, glow, 0.7 * glow, 1]);
    }
  }
}
