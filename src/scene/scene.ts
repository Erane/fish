import { BODY, clamp, fishPalette, fishPose, TAU } from "../core/index.ts";
import type { Fish, Food, Obstacle, Settings, Weather } from "../core/types.ts";
import { FISH_PPU } from "../render/batch.ts";
import type { BodyLight, Look, Renderer, Vec2, Vec3, Vec4 } from "../render/types.ts";
import type { PondBed } from "../render/pondBed.ts";
import { hexToRgb01 } from "../style.ts";
import { PALETTES } from "../core/palette.ts";
import { fishSprite, girthOf, halfWidth } from "../art/koi.ts";
import type { FishSkin } from "../art/skin.ts";
import type { SkinSpecies } from "../core/skins.ts";
import { absorption, lerpLook, lookFor } from "./look.ts";
import { moonPhase } from "./moon.ts";
import type { MoonPhase } from "./moon.ts";
import { Floaters } from "./floaters.ts";
import type { FloaterEnv } from "./floaters.ts";
import { Creatures } from "./creatures.ts";

interface Entry {
  cell: number;
  ready: boolean;
  canvas?: HTMLCanvasElement;
  light?: BodyLight;
}

interface RainDrop {
  x: number;
  y: number;
  z: number;
  l: number;
  v: number;
}

interface Flake {
  x: number;
  y: number;
  z: number;
  life: number;
  age: number;
  melt: number;
  p: number;
}

interface Splash {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  age: number;
  life: number;
  ring: boolean;
}

export interface SimView {
  allFish: Fish[];
  food: Food[];
  scale: number;
  obstacles: Obstacle[];
}

export function finSpread(
  f: Fish,
  time: number,
  side: number,
  spreadK: number,
  bl: number,
): number {
  const base =
    1.05 -
    0.6 * clamp(bl / 1.4, 0, 1) +
    (f.thrust < 0.3 ? Math.sin(time * 4.2 + f.seed) * 0.16 : 0);
  const idle =
    f.rest > 0 || f.thrust < 0.15
      ? side * Math.sin(time * (2.2 + f.temper.scullRate) + f.seed * 0.013) * 0.25
      : 0;
  return (base + clamp(side * f.turn * 0.35, -0.35, 0.6) + idle) * spreadK;
}

export class PondScene {
  private readonly R: Renderer;
  private readonly sim: SimView;
  private readonly entries = new WeakMap<Fish, Entry>();
  private readonly finTint: Vec4[];
  private readonly pose: Float32Array;
  private readonly calm: boolean;
  private readonly wakes = new Map<Fish, number>();
  private readonly bottoms = new Map<Fish, number>();
  private rain: RainDrop[] = [];
  private snow: Flake[] = [];
  private splashes: Splash[] = [];
  private bolts: [number, number][] = [];
  private nextBolt = 15;
  private snowCover = 0;
  private wetCover = 0;
  private causticCell = 80;
  private cloudWind: Vec2 = [0, 0];
  private moonDisc: Vec4 = [0, 0, 1, 0];
  private moonAt: Vec2 = [0, 0];
  private phase: MoonPhase;
  private phaseAt = 0;
  private readonly floaters: Floaters;
  private readonly creatures: Creatures;
  private fenv: FloaterEnv = {
    weather: "sunny",
    rainK: 0,
    calm: false,
    scale: 1,
    w: 1,
    h: 1,
    time: 0,
  };
  look: Look;
  onLightning: ((strength: number) => void) | null = null;
  private seasonTint: Vec3 | null = null;
  private skins: Partial<Record<SkinSpecies, FishSkin>> = {};
  w = 1;
  h = 1;
  scale = 1;
  time = 0;

  constructor(R: Renderer, sim: SimView, bed: PondBed) {
    this.R = R;
    this.sim = sim;
    this.pose = new Float32Array((BODY.segments + 1) * 4);
    this.finTint = PALETTES.map((p) => {
      const c = hexToRgb01(p.fin);
      return [c[0], c[1], c[2], 0.9] as Vec4;
    });
    this.calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.phase = moonPhase();
    this.look = lookFor("sunny", false);
    this.floaters = new Floaters(R, bed.decor, bed.bedW, bed.bedH, (x, y, s, leaf) =>
      this.splash(x, y, s, leaf),
    );
    this.creatures = new Creatures(R, bed.anchors, bed.bedW, bed.bedH, (x, y, r, s) =>
      this.stir(x, y, r, s),
    );
  }

  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.scale = clamp(Math.min(w, h) / 800, 0.62, 1.12);
    this.causticCell = clamp(Math.min(w, h) / 7, 70, 150);
    this.moonAt = [w * 0.6, h * 0.28];
    const span = Math.max(w, h);
    const sail = this.calm ? 0 : 1;
    this.cloudWind = [0.021 * span * sail, -0.007 * span * sail];
    this.floaters.layout(w, h);
    this.sim.obstacles = this.creatures.layout(w, h, this.scale);
    this.applyRuntime();
  }

  private applyRuntime(): void {
    this.look.sun = [-0.45, 0.45, 0.77];
    this.look.moonDisc = [this.moonDisc[0], this.moonDisc[1], this.moonDisc[2], this.moonDisc[3]];
    this.look.causticCell = this.causticCell;
    this.look.cloudWind = [this.cloudWind[0], this.cloudWind[1]];
  }

  setSeasonTint(hex: string | null): void {
    this.seasonTint = hex ? hexToRgb01(hex) : null;
  }

  setLook(weather: Weather, night: boolean, dt: number, rain = 0.5, snow = 0.5, caustic = 1): void {
    const target = lookFor(weather, night, rain, snow);
    target.caustic *= caustic;
    if (this.seasonTint) {
      const t = this.seasonTint;
      target.water = [
        target.water[0] * 0.5 + t[0] * 0.5,
        target.water[1] * 0.5 + t[1] * 0.5,
        target.water[2] * 0.5 + t[2] * 0.5,
      ];
    }
    if (dt <= 0) this.look = target;
    else lerpLook(this.look, target, 1 - Math.exp(-dt * 1.1));
    this.applyRuntime();
  }

  drop(x: number, y: number, r: number, s: number): void {
    this.R.drop(x, y, r, s);
    this.floaters.pushPetals(x, y, r, s);
  }

  startle(x: number, y: number): void {
    this.creatures.startle(x, y);
  }

  private stir(x: number, y: number, r: number, s: number): void {
    if (!this.calm) this.drop(x, y, r, s);
  }

  forget(f: Fish): void {
    this.wakes.delete(f);
    this.bottoms.delete(f);
    this.R.drop(f.x * this.w, f.y * this.h, 12 * this.scale, 0.8);
  }

  setSkins(skins: Partial<Record<SkinSpecies, FishSkin>>): void {
    this.skins = skins;
    for (const f of this.sim.allFish) {
      const e = this.entries.get(f);
      if (e) {
        e.ready = false;
        e.light = undefined;
        e.canvas = undefined;
      }
    }
  }

  private skinFor(f: Fish): FishSkin | undefined {
    return this.skins[f.species === "silvercarp" ? "silvercarp" : "koi"];
  }

  sync(): void {
    this.sim.allFish.forEach((f, i) => {
      let e = this.entries.get(f);
      if (!e) {
        e = { cell: -1, ready: false };
        this.entries.set(f, e);
      }
      if (!e.ready || e.cell !== i) {
        const skin = this.skinFor(f);
        e.canvas = skin ? skin.canvas : (e.canvas ?? fishSprite(f, FISH_PPU));
        this.R.setFish(i, e.canvas);
        e.cell = i;
        e.ready = true;
      }
    });
  }

  private entry(f: Fish): Entry | undefined {
    return this.entries.get(f);
  }

  private bodyLight(f: Fish): BodyLight {
    const e = this.entry(f)!;
    const pal = fishPalette(f);
    if (e.light && e.light.seed === f.seed && e.light.palette === f.palette) return e.light;
    const girth = girthOf(f.seed);
    const skin = this.skinFor(f);
    const widths = skin
      ? skin.widths
      : (() => {
          const w = new Float32Array(BODY.segments + 1);
          for (let i = 0; i <= BODY.segments; i++)
            w[i] =
              halfWidth(BODY.nose - (i * BODY.length) / BODY.segments, girth, pal.kind) / BODY.half;
          return w;
        })();
    const kind = pal.kind;
    e.light = {
      species: f.species,
      seed: f.seed,
      palette: f.palette,
      widths,
      metal: skin ? 0 : kind === "ogon" ? 1 : 0,
      gloss: skin ? 0.26 : kind === "ogon" ? 0.3 : kind === "karasu" ? 0.12 : 0.26,
    };
    return e.light;
  }

  private column(x: number, y: number, down: number): number {
    const k = this.look.depth;
    return down * (1 - k + k * (0.35 + 0.65 * this.R.depthAt(x, y)));
  }

  private splash(x: number, y: number, s: number, leaf = false): void {
    if (this.splashes.length > 260) return;
    const k = this.scale * s;
    this.splashes.push({ x, y, vx: 0, vy: 0, s: k, age: 0, life: leaf ? 0.3 : 0.38, ring: true });
    for (let i = 2 + Math.floor(Math.random() * (leaf ? 4 : 3)); i > 0; i--) {
      const a = Math.random() * TAU;
      const v = (28 + Math.random() * 52) * k;
      this.splashes.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        s: k * (0.6 + Math.random() * 0.5),
        age: 0,
        life: 0.16 + Math.random() * 0.16,
        ring: false,
      });
    }
  }

  update(dt: number, settings: Settings): void {
    this.time += dt;
    this.sync();
    if (this.time - this.phaseAt > 60) {
      this.phaseAt = this.time;
      this.phase = moonPhase();
    }
    const { w, h, scale } = this;
    this.moonDisc = [this.moonAt[0], h - this.moonAt[1], 26 * scale, this.phase.angle];
    this.look.moonDisc = [this.moonDisc[0], this.moonDisc[1], this.moonDisc[2], this.moonDisc[3]];

    const weather = settings.weather;
    const rainK = clamp(settings.rainAmount, 0, 1);
    const snowK = clamp(settings.snowAmount, 0, 1);
    this.snowCover =
      weather === "snow"
        ? Math.min(snowK * 0.9, this.snowCover + dt * (0.004 + 0.02 * snowK))
        : Math.max(0, this.snowCover - dt * 0.012);
    this.wetCover =
      weather === "rain"
        ? Math.min(1, this.wetCover + dt * (0.04 + 0.1 * rainK))
        : Math.max(0, this.wetCover - dt * 0.02);
    this.look.snowCover = this.snowCover;
    this.look.wetCover = this.wetCover;
    this.look.rainK = weather === "rain" ? rainK : 0;

    const rainK2 = rainK * rainK;
    const rainN =
      weather === "rain" && !this.calm
        ? Math.round((30 + 190 * rainK2) * Math.min(1, (w * h) / 1.2e6) + 20)
        : 0;
    while (this.rain.length < rainN) {
      const z = Math.pow(Math.random(), 1.8);
      this.rain.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z,
        l: 0.5 + z * 0.9 + Math.random() * 0.2,
        v: 600 + z * 700 + Math.random() * 200,
      });
    }
    if (this.rain.length > rainN) this.rain.length = rainN;
    for (const d of this.rain) {
      d.y += d.v * dt;
      d.x += d.v * 0.12 * dt;
      if (d.y > h + 60) {
        d.y = -60 - Math.random() * 60;
        d.x = Math.random() * (w + 80) - 60;
      }
    }
    if (weather === "rain" && !this.calm) {
      let n = dt * (6 + 70 * rainK2) * Math.min(1.6, (w * h) / 1e6);
      while (n > 0) {
        if (Math.random() < n) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          this.R.drop(
            x,
            y,
            (3 + Math.random() * 3) * scale,
            (0.2 + Math.random() * 0.3) * (0.55 + 0.35 * rainK),
          );
          if (Math.random() < 0.4) this.splash(x, y, 0.5 + Math.random() * 0.4);
        }
        n -= 1;
      }
    }

    for (const p of this.splashes) {
      p.age += dt;
      if (!p.ring) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-dt * 7);
        p.vy *= Math.exp(-dt * 7);
      }
    }
    this.splashes = this.splashes.filter((p) => p.age < p.life);

    if (weather === "rain" && rainK > 0.6 && !this.calm) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        const k = 0.6 + Math.random() * 0.4;
        const t0 = this.time;
        this.bolts.push([t0, k], [t0 + 0.09 + Math.random() * 0.06, k * 0.45]);
        if (Math.random() < 0.6) this.bolts.push([t0 + 0.28 + Math.random() * 0.25, k * 0.75]);
        this.nextBolt = 22 + Math.random() * 48;
        this.onLightning?.(k);
      }
    } else this.nextBolt = Math.max(this.nextBolt, 8 + Math.random() * 12);
    let flash = 0;
    for (const [t0, k] of this.bolts) {
      const t = this.time - t0;
      if (t >= 0) flash += k * Math.min(1, t / 0.025) * Math.exp(-t * 14);
    }
    this.bolts = this.bolts.filter(([t0]) => this.time - t0 < 1.2);
    this.look.flash = flash * 0.3;

    const snowN =
      weather === "snow" && !this.calm
        ? Math.round((50 + 330 * snowK) * Math.min(1.5, (w * h) / 1e6) + 20)
        : 0;
    const wind = (6 + 16 * snowK) * scale;
    const reset = (f: Flake): void => {
      f.x = Math.random() * (w + 80) - 80;
      f.y = Math.random() * h * 0.95;
      f.z = Math.pow(Math.random(), 1.6);
      f.life = 2 + Math.random() * 10;
      f.age = 0;
      f.melt = 0;
      f.p = Math.random() * TAU;
    };
    while (this.snow.length < snowN) {
      const f: Flake = { x: 0, y: 0, z: 0, life: 0, age: 0, melt: 0, p: 0 };
      reset(f);
      this.snow.push(f);
    }
    if (this.snow.length > snowN) this.snow.length = snowN;
    for (const f of this.snow) {
      if (f.melt > 0) {
        f.melt -= dt;
        if (f.melt <= 0) reset(f);
        continue;
      }
      f.life -= dt;
      f.age += dt;
      f.y += (8 + f.z * 34) * (0.8 + snowK * 0.4) * scale * dt;
      f.x += (wind * (0.4 + f.z) + Math.sin(this.time * 0.7 + f.p) * (6 + f.z * 10) * scale) * dt;
      if (f.x > w + 30) f.x -= w + 60;
      if (f.life <= 0) {
        f.melt = 0.6;
        if (Math.random() < 0.5) this.R.drop(f.x, f.y, (2 + f.z * 2) * scale, 0.04 + f.z * 0.05);
      }
    }

    for (const f of this.sim.allFish) {
      const L = BODY.length * f.size * this.sim.scale;
      const bl = f.v / L;
      if (f.depth < 0.22 && bl > 0.45) {
        const t = (this.wakes.get(f) ?? 0) - dt;
        if (t <= 0) {
          if (!this.calm) {
            const s = f.size * this.sim.scale;
            this.R.drop(
              f.x * w + Math.cos(f.angle) * BODY.nose * s,
              f.y * h + Math.sin(f.angle) * BODY.nose * s,
              3.2 * scale,
              0.04 * (1 - f.depth / 0.22) * Math.min(2, bl),
            );
          }
          this.wakes.set(f, 0.14);
        } else this.wakes.set(f, t);
      }
      if (f.peck > 0 && f.depth > 0.85 && !this.calm) {
        const bt = (this.bottoms.get(f) ?? 0) - dt;
        if (bt <= 0) {
          this.R.drop(f.x * w, f.y * h, 4.5 * scale, 0.12);
          this.bottoms.set(f, 0.5);
        } else this.bottoms.set(f, bt);
      }
    }

    this.fenv = { weather, rainK, calm: this.calm, scale, w, h, time: this.time };
    this.floaters.update(dt, this.fenv);
    this.creatures.update(dt, settings, this.time);
  }

  private koi(f: Fish, cell: number, col: number): void {
    const R = this.R;
    const look = this.look;
    const s = f.size * this.sim.scale;
    const pose = fishPose(f, s, this.pose);
    const cx = f.x * this.w;
    const cy = f.y * this.h;
    const k = 1 - f.depth * 0.18;
    const fogA = 0.05 + col * 0.45;
    const fog: Vec4 = [look.water[0], look.water[1], look.water[2], fogA];
    const off = (6 + (1 - f.depth) * 42) * this.scale;
    const dx = look.shadowDir[0] * off;
    const dy = look.shadowDir[1] * off;
    const sh: Vec4 = [0, 0, 0, 0.92 - (1 - f.depth) * 0.22];
    const blur: Vec4 = [(1 - f.depth) * 1.1 + col * 0.45, 0, 0, 0];
    const L = BODY.length * s;
    const bl = f.v / L;
    const pal = fishPalette(f);
    const slender = pal.kind === "silvercarp";
    const finDef = R.sprites[pal.kind === "utsuri" ? "finMoto" : "fin"]!;
    const abs = absorption(col);
    const body: Vec4 = [abs[0], abs[1], abs[2], 1];
    const src: Vec4 =
      pal.kind === "utsuri"
        ? [1, 1, 1, 0.92]
        : f.species === "silvercarp"
          ? ([...hexToRgb01(pal.fin), 0.85] as Vec4)
          : this.finTint[f.palette]!;
    const tint: Vec4 = [src[0] * abs[0], src[1] * abs[1], src[2] * abs[2], src[3]];
    const fins: [number, number, number][] = [
      [4, 0.95, 1],
      [8, 0.55, 0.58],
    ];
    for (const [i, spreadK, size] of fins) {
      const px = pose[i * 4]!;
      const py = pose[i * 4 + 1]!;
      const nx = pose[i * 4 + 2]!;
      const ny = pose[i * 4 + 3]!;
      const heading = Math.atan2(-nx, ny);
      const hw =
        halfWidth(BODY.nose - (i * BODY.length) / BODY.segments, girthOf(f.seed), pal.kind) *
        s *
        0.8;
      for (const side of [1, -1]) {
        const spread = finSpread(f, this.time, side, spreadK, bl);
        const ang = heading + side * (Math.PI - spread);
        const X = cx + (px + nx * hw * side - cx) * k;
        const Y = cy + (py + ny * hw * side - cy) * k;
        const fs = s * k * 0.85 * size;
        R.sprite(
          "under",
          finDef,
          X,
          Y,
          ang,
          fs * (slender ? 0.88 : 1),
          side * fs * (slender ? 0.5 : 1),
          tint,
          fog,
        );
        if (size === 1)
          R.sprite(
            "shadow",
            finDef,
            X + dx,
            Y + dy,
            ang,
            fs * (slender ? 0.88 : 1),
            side * fs * (slender ? 0.5 : 1),
            [0, 0, 0, sh[3] * 0.6],
            blur,
          );
      }
    }
    R.fish("shadow", cell, pose, s, cx, cy, k, sh, blur, dx, dy);
    R.fish("under", cell, pose, s, cx, cy, k, body, fog, 0, 0, this.bodyLight(f));
  }

  private drawFood(lit: Vec3): void {
    const R = this.R;
    const look = this.look;
    const scale = this.scale;
    for (const p of this.sim.food) {
      const fade = Math.min(1, p.life / 2);
      const pop = 1 + Math.max(0, 0.25 - p.age) * 1.6;
      const s = scale * 0.72 * pop * (1 + Math.sin(this.time * 2 + p.drift) * 0.04);
      R.sprite(
        "shadow",
        R.sprites.dot!,
        p.x + look.shadowDir[0] * 9 * scale,
        p.y + look.shadowDir[1] * 9 * scale,
        0,
        s * 0.45,
        s * 0.45,
        [0, 0, 0, 0.5 * fade],
      );
      R.sprite("surface", R.sprites.pellet!, p.x, p.y, p.drift, s, s, [
        lit[0],
        lit[1],
        lit[2],
        fade,
      ]);
    }
  }

  private drawWeather(lit: Vec3): void {
    const R = this.R;
    const look = this.look;
    const scale = this.scale;
    const rk = look.rainK;
    for (const d of this.rain) {
      const a = (0.09 + 0.24 * d.z) * (0.75 + 0.5 * rk);
      R.sprite(
        "air",
        R.sprites.streak!,
        d.x,
        d.y,
        -0.12 - rk * 0.06,
        0.7 + 0.7 * d.z,
        d.l * (0.4 + 0.25 * rk) * scale,
        [0.9, 0.95, 1, a],
      );
    }
    for (const p of this.splashes) {
      const t = p.age / p.life;
      if (p.ring) {
        const r = p.s * (0.25 + 0.75 * Math.sqrt(t));
        const a = Math.pow(1 - t, 1.6) * 0.28;
        R.sprite("surface", R.sprites.ring!, p.x, p.y, 0, r, r * 0.9, [lit[0], lit[1], lit[2], a]);
      } else {
        const a = (1 - t) * 0.5;
        const r = p.s * 0.16 * (1 - t * 0.4);
        R.sprite("air", R.sprites.dot!, p.x, p.y, 0, r, r, [1, 1, 1, a]);
      }
    }
    for (const f of this.snow) {
      const m = f.melt > 0 ? f.melt / 0.6 : 1;
      const s = (0.28 + f.z * 1.25) * scale * (f.melt > 0 ? 0.4 + 0.6 * m : 1);
      const a = Math.min(1, f.age * 2) * m * (0.55 + 0.4 * f.z);
      const near = f.z > 0.82;
      if (f.z > 0.4)
        R.sprite(
          "airShadow",
          R.sprites.flake!,
          f.x + (4 + 18 * f.z) * scale,
          f.y + (4 + 18 * f.z) * scale,
          0,
          s,
          s,
          [0, 0, 0, 0.16 * a],
        );
      R.sprite(
        "air",
        near ? R.sprites.dot! : R.sprites.flake!,
        f.x,
        f.y,
        0,
        near ? s * 1.5 : s,
        near ? s * 1.5 : s,
        [1, 1, 1, near ? a * 0.7 : a],
      );
    }
  }

  draw(settings: Settings): void {
    const { w, h } = this;
    const look = this.look;
    const lit: Vec3 = [
      look.bright * look.tint[0],
      look.bright * look.tint[1],
      look.bright * look.tint[2],
    ];
    const items: { d: number; run: () => void }[] = [];
    this.sim.allFish.forEach((f, i) => {
      if (!(this.entry(f)?.ready && f.spine)) return;
      const d = this.column(f.x * w, f.y * h, f.depth ?? 0.5);
      items.push({ d, run: () => this.koi(f, i, d) });
    });
    if (settings.turtles)
      for (const t of this.creatures.turtles) {
        const d = this.column(t.x * w, t.y * h, t.depth) + 0.02;
        items.push({ d, run: () => this.creatures.drawTurtle(t, d, look) });
      }
    items.sort((a, b) => b.d - a.d);
    for (const it of items) it.run();
    this.floaters.draw(this.fenv, look);
    this.floaters.drawPetals(this.scale, look);
    this.drawFood(lit);
    this.creatures.drawSurface(look);
    this.drawWeather(lit);
    this.creatures.drawAir(look);
  }
}
