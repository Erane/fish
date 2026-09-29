import { TAU } from "../core/index.ts";
import { FISH_SHADE } from "../style.ts";
import type { SpriteDef, SpriteSet } from "../render/types.ts";

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function def(c: HTMLCanvasElement, ppu: number, px: number, py: number): SpriteDef {
  return {
    canvas: c,
    w: c.width,
    h: c.height,
    ppu,
    px,
    py,
    x: 0,
    y: 0,
    u0: 0,
    v0: 0,
    u1: 0,
    v1: 0,
  };
}

export function finSprite(ppu = 4, motoguro = false): SpriteDef {
  const c = canvas(21 * ppu, 14 * ppu);
  const ctx = c.getContext("2d")!;
  ctx.scale(ppu, ppu);
  ctx.translate(1, 7);
  const path = new Path2D();
  path.moveTo(0, -1.7);
  path.bezierCurveTo(5, -4, 12, -6.3, 15.8, -4.3);
  path.bezierCurveTo(18.2, -2.4, 18, 3, 15.2, 4.7);
  path.bezierCurveTo(10.6, 6.6, 4.6, 4.4, 0, 1.7);
  path.closePath();
  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  if (motoguro) {
    ctx.fillStyle = "rgba(36,44,42,.92)";
    ctx.fillRect(-1, -8, 8.5, 16);
  }
  ctx.lineCap = "round";
  for (let k = 0; k < 8; k++) {
    const a = -0.45 + k * 0.13;
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(Math.cos(a) * 18.5, Math.sin(a) * 18.5);
    ctx.strokeStyle = motoguro && k < 3 ? "rgba(214,218,208,.5)" : "rgba(120,128,118,.5)";
    ctx.lineWidth = 0.22;
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(120,128,118,.75)";
  ctx.lineWidth = FISH_SHADE.outlineWidth;
  ctx.lineJoin = "round";
  ctx.stroke(path);
  return def(c, ppu, 1 / 21, 0.5);
}

function dotSprite(): SpriteDef {
  const c = canvas(48, 48);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 23);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,.75)");
  g.addColorStop(0.6, "rgba(255,255,255,.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 48, 48);
  return def(c, 4, 0.5, 0.5);
}

function flakeSprite(): SpriteDef {
  const c = canvas(32, 32);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(15, 15, 0, 16, 16, 15);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(250,252,255,.92)");
  g.addColorStop(0.8, "rgba(240,246,255,.35)");
  g.addColorStop(1, "rgba(240,246,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return def(c, 4, 0.5, 0.5);
}

function ringSprite(): SpriteDef {
  const c = canvas(64, 64);
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "rgba(255,255,255,.3)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(32, 32, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.95)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(32, 32, 24, 0, Math.PI * 2);
  ctx.stroke();
  return def(c, 4, 0.5, 0.5);
}

function pelletSprite(): SpriteDef {
  const c = canvas(28, 28);
  const ctx = c.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(14, 14, 9.6, 0, TAU);
  ctx.fillStyle = "#b88645";
  ctx.fill();
  ctx.strokeStyle = "rgba(60,40,20,.6)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,248,220,.75)";
  ctx.beginPath();
  ctx.ellipse(10.5, 9.5, 2.6, 1.8, -0.6, 0, TAU);
  ctx.fill();
  return def(c, 4, 0.5, 0.5);
}

function streakSprite(): SpriteDef {
  const c = canvas(10, 90);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(240,246,250,.5)";
  ctx.beginPath();
  ctx.moveTo(4.4, 0);
  ctx.lineTo(5.6, 0);
  ctx.lineTo(6.4, 89);
  ctx.lineTo(3.6, 89);
  ctx.closePath();
  ctx.fill();
  return def(c, 1, 0.5, 1);
}

export function buildSprites(): SpriteSet {
  return {
    fin: finSprite(4, false),
    finMoto: finSprite(4, true),
    dot: dotSprite(),
    flake: flakeSprite(),
    ring: ringSprite(),
    streak: streakSprite(),
    pellet: pelletSprite(),
  };
}
