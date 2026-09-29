import { clamp, TAU } from "../core/index.ts";
import type { BedShape } from "../render/bedShapes.ts";
import type { Renderer } from "../render/types.ts";
import type { Look, Vec4 } from "../render/types.ts";
import { floatShapes, isBigLeaf } from "./anchors.ts";

const BIG_FLOWER = 0.03;

interface Motion {
  stat: boolean;
  turn: number;
  move: number;
  push: number;
  snowK: number;
  wetKind: number;
  pool: number;
  grow: number;
  light: number;
}

function motionOf(s: BedShape): Motion {
  const k = s.kind;
  if (k === "rock" || k === "mossCap")
    return {
      stat: true,
      turn: 0,
      move: 0,
      push: 0,
      snowK: 1,
      wetKind: 0,
      pool: 0,
      grow: 1,
      light: 0,
    };
  const grow =
    k === "flower" || k === "bud" || k === "heart" ? 1.1 : k === "leaf" || k === "penny" ? 1.02 : 1;
  if (isBigLeaf(s))
    return {
      stat: false,
      turn: 0.032,
      move: 1.6,
      push: 1.8,
      snowK: 1,
      wetKind: 1,
      pool: 1,
      grow,
      light: 0.5,
    };
  if (k === "bud")
    return {
      stat: false,
      turn: 0.13,
      move: 3.2,
      push: 2.6,
      snowK: 0.32,
      wetKind: 0.45,
      pool: 0,
      grow,
      light: 3,
    };
  if (k === "flower")
    return s.size > BIG_FLOWER
      ? {
          stat: false,
          turn: 0.085,
          move: 2.4,
          push: 2.6,
          snowK: 0.32,
          wetKind: 0.45,
          pool: 0,
          grow,
          light: 1.2,
        }
      : {
          stat: false,
          turn: 0.075,
          move: 2.4,
          push: 3.5,
          snowK: 0.32,
          wetKind: 0.45,
          pool: 0,
          grow,
          light: 2,
        };
  const light = clamp(0.05 / s.size, 0.4, 1.6);
  return {
    stat: false,
    turn: 0.075,
    move: 2.4,
    push: 2.6,
    snowK: 0.6,
    wetKind: 1,
    pool: 0,
    grow,
    light,
  };
}

interface Floater {
  s: BedShape;
  mot: Motion;
  bx: number;
  by: number;
  rx: number;
  ry: number;
  p: [number, number, number, number];
  sp: number;
  seed: number;
  ja: number;
  jv: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  dx: number;
  dy: number;
}

interface Target {
  cum: number;
  fl: Floater;
}

interface Petal {
  x: number;
  y: number;
  a: number;
  spin: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  s: number;
}

export interface FloaterEnv {
  weather: string;
  rainK: number;
  calm: boolean;
  scale: number;
  w: number;
  h: number;
  time: number;
}

export class Floaters {
  private readonly R: Renderer;
  private readonly rnd: () => number;
  private readonly splash: (x: number, y: number, s: number, leaf: boolean) => void;
  private readonly m: number;
  private readonly list: Floater[];
  private targets: Target[] = [];
  private targetArea = 0;
  private lotus: [number, number][] = [];
  private petals: Petal[] = [];
  private k = 1;

  constructor(
    R: Renderer,
    shapes: BedShape[],
    bedW: number,
    bedH: number,
    splash: (x: number, y: number, s: number, leaf: boolean) => void,
    rnd: () => number = Math.random,
  ) {
    this.R = R;
    this.rnd = rnd;
    this.splash = splash;
    this.m = Math.min(bedW, bedH);
    this.list = floatShapes(shapes).map((s) => ({
      s,
      mot: motionOf(s),
      bx: s.x * bedW,
      by: s.y * bedH,
      rx: s.size * this.m,
      ry: s.size * this.m,
      p: [rnd() * TAU, rnd() * TAU, rnd() * TAU, rnd() * TAU],
      sp: 0.8 + rnd() * 0.4,
      seed: rnd(),
      ja: 0,
      jv: 0,
      ox: 0,
      oy: 0,
      vx: 0,
      vy: 0,
      dx: 0,
      dy: 0,
    }));
  }

  layout(w: number, h: number): void {
    const R = this.R;
    const [x0, y0] = R.imageToScreen(0, 0);
    const [x1, y1] = R.imageToScreen(1, 0);
    this.k = Math.hypot(x1 - x0, y1 - y0);
    this.targets = [];
    this.targetArea = 0;
    for (const fl of this.list) {
      const [sx, sy] = R.imageToScreen(fl.bx, fl.by);
      const r = Math.max(fl.rx, fl.ry) * this.k;
      if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) continue;
      this.targetArea += Math.PI * fl.rx * fl.ry * this.k * this.k;
      this.targets.push({ cum: this.targetArea, fl });
    }
    this.lotus = this.list
      .filter((fl) => fl.s.kind === "flower" && fl.s.size > BIG_FLOWER)
      .map((fl) => R.imageToScreen(fl.bx, fl.by))
      .filter(([x, y]) => x > -40 && x < w + 40 && y > -40 && y < h + 40);
  }

  private hit(fl: Floater, rainK: number): void {
    const rnd = this.rnd;
    const a = rnd() * TAU;
    const r = Math.sqrt(rnd()) * 0.85;
    const ex = Math.cos(a) * fl.rx * r;
    const ey = Math.sin(a) * fl.ry * r;
    const rot = fl.s.rot;
    const [sx, sy] = this.R.imageToScreen(
      fl.bx + ex * Math.cos(rot) - ey * Math.sin(rot),
      fl.by + ex * Math.sin(rot) + ey * Math.cos(rot),
    );
    this.splash(sx + fl.dx, sy + fl.dy, fl.mot.stat ? 0.8 : 0.65 + 0.25 * rainK, true);
    if (fl.mot.stat) return;
    const light = fl.mot.light;
    const side = (rnd() < 0.5 ? -1 : 1) * (0.4 + r);
    fl.jv += side * 0.045 * light * 8;
    fl.vx -= Math.cos(a) * r * light * 9;
    fl.vy -= Math.sin(a) * r * light * 9;
  }

  pushPetals(x: number, y: number, r: number, s: number): void {
    for (const p of this.petals) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy);
      if (d < r * 8 && d > 0) {
        p.vx += (dx / d) * s * 40;
        p.vy += (dy / d) * s * 40;
      }
    }
  }

  update(dt: number, env: FloaterEnv): void {
    const rnd = this.rnd;
    const { w, h, time } = env;
    if (env.weather === "rain" && !env.calm && this.targetArea > 0) {
      let m = (dt * (14 + 90 * env.rainK) * this.targetArea) / 1e6;
      while (m > 0) {
        if (rnd() < m && this.targets.length) {
          const pick = rnd() * this.targetArea;
          const t = this.targets.find((t) => t.cum >= pick);
          if (t) this.hit(t.fl, env.rainK);
        }
        m -= 1;
      }
    }
    const e = Math.min(dt, 0.05);
    for (const fl of this.list) {
      if (!fl.jv && !fl.ja && !fl.vx && !fl.vy && !fl.ox && !fl.oy) continue;
      fl.jv += (-60 * fl.ja - 6 * fl.jv) * e;
      fl.ja += fl.jv * e;
      fl.vx += (-45 * fl.ox - 5 * fl.vx) * e;
      fl.vy += (-45 * fl.oy - 5 * fl.vy) * e;
      fl.ox += fl.vx * e;
      fl.oy += fl.vy * e;
      if (
        Math.abs(fl.ja) +
          Math.abs(fl.jv) +
          Math.abs(fl.ox) +
          Math.abs(fl.oy) +
          Math.abs(fl.vx) +
          Math.abs(fl.vy) <
        1e-3
      )
        fl.ja = fl.jv = fl.ox = fl.oy = fl.vx = fl.vy = 0;
    }
    if (this.petals.length < 5 && rnd() < dt * 0.05) {
      const p0 = this.lotus.length
        ? this.lotus[Math.floor(rnd() * this.lotus.length)]!
        : ([rnd() * w, rnd() * h] as [number, number]);
      this.petals.push({
        x: p0[0] + (rnd() - 0.5) * 60,
        y: p0[1] + (rnd() - 0.5) * 60,
        a: rnd() * TAU,
        spin: (rnd() - 0.5) * 0.3,
        vx: (w / 2 - p0[0]) * 0.02,
        vy: (h / 2 - p0[1]) * 0.02,
        life: 60 + rnd() * 60,
        age: 0,
        s: 0.8 + rnd() * 0.5,
      });
    }
    for (const p of this.petals) {
      p.age += dt;
      p.vx *= Math.exp(-dt * 0.5);
      p.vy *= Math.exp(-dt * 0.5);
      p.x += (p.vx + Math.sin(time * 0.1 + p.a) * 2) * dt;
      p.y += (p.vy + Math.cos(time * 0.08 + p.a) * 2) * dt;
      p.a += (p.spin + (Math.abs(p.vx) + Math.abs(p.vy)) * 0.004) * dt;
    }
    this.petals = this.petals.filter(
      (p) => p.age < p.life && p.x > -60 && p.x < w + 60 && p.y > -60 && p.y < h + 60,
    );
  }

  draw(env: FloaterEnv, look: Look): void {
    const R = this.R;
    const { scale, time } = env;
    const gust = 0.8 + look.wave * 0.45;
    for (const fl of this.list) {
      const { mot } = fl;
      if (mot.stat) {
        R.floater(fl.bx, fl.by, fl.rx, fl.ry, fl.s.rot, 0, 0, 0, 0, 1, 0, 0, fl.seed);
        continue;
      }
      const sp = fl.sp;
      const p = fl.p;
      const turn = mot.turn * gust;
      const move = mot.move * scale * gust;
      const angle =
        turn * Math.sin(time * 0.33 * sp + p[0]) + turn * 0.4 * Math.sin(time * 0.91 * sp + p[1]);
      fl.dx = move * Math.sin(time * 0.29 * sp + p[2]) + fl.ox * scale;
      fl.dy = move * Math.cos(time * 0.23 * sp + p[3]) + fl.oy * scale;
      R.floater(
        fl.bx,
        fl.by,
        fl.rx * mot.grow,
        fl.ry * mot.grow,
        fl.s.rot,
        angle + fl.ja,
        fl.dx,
        fl.dy,
        mot.push * scale,
        mot.snowK,
        mot.wetKind,
        mot.pool,
        fl.seed,
      );
    }
  }

  drawPetals(scale: number, look: Look): void {
    const R = this.R;
    const petal = R.sprites.petal;
    if (!petal) return;
    const lit: Vec4 = [
      look.bright * look.tint[0],
      look.bright * look.tint[1],
      look.bright * look.tint[2],
      1,
    ];
    for (const p of this.petals) {
      const fade = Math.min(1, p.age / 3, (p.life - p.age) / 4);
      const s = scale * p.s;
      R.sprite(
        "shadow",
        petal,
        p.x + look.shadowDir[0] * 14 * scale,
        p.y + look.shadowDir[1] * 14 * scale,
        p.a,
        s,
        s,
        [0, 0, 0, 0.35 * fade],
      );
      R.sprite("surface", petal, p.x, p.y, p.a, s, s, [lit[0], lit[1], lit[2], fade]);
    }
  }
}
