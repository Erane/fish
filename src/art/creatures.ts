import { FISH_SHADE } from "../style.ts";
import type { SpriteDef, SpriteSet } from "../render/types.ts";

const TAU = Math.PI * 2;

const OUT = (FISH_SHADE.outline.match(/[\d.]+/g) ?? ["0", "0", "0", "1"]).map(Number);
const line = (a: number): string => `rgba(${OUT[0]},${OUT[1]},${OUT[2]},${OUT[3]! * a})`;
const LEVELS = FISH_SHADE.shadeLevels;
const LAST = LEVELS.length - 1;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

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

const STEP8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

export function inkEdge(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  ppu: number,
  units = 0.5,
  k = 0.8,
): void {
  const r = Math.max(1, Math.round(units * ppu));
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const j = (py * w + px) * 4;
      if (data[j + 3]! < 128) continue;
      let edge = false;
      for (let a = 0; a < 8 && !edge; a++) {
        const qx = px + STEP8[a]![0] * r;
        const qy = py + STEP8[a]![1] * r;
        edge = qx < 0 || qy < 0 || qx >= w || qy >= h || data[(qy * w + qx) * 4 + 3]! < 128;
      }
      if (!edge) continue;
      data[j] = mix(data[j]!, OUT[0]!, k);
      data[j + 1] = mix(data[j + 1]!, OUT[1]!, k);
      data[j + 2] = mix(data[j + 2]!, OUT[2]!, k);
    }
}

interface TurtleSkin {
  shell: string;
  light: string;
  seam: string;
  line: string;
  skin: string;
  stripe: string;
  ear: string | null;
  plastron: string;
}

const TURTLES: TurtleSkin[] = [
  {
    shell: "#56663a",
    light: "#7d8a4c",
    seam: "#2c341f",
    line: "#cdbb66",
    skin: "#546238",
    stripe: "#d3c97a",
    ear: "#c0482e",
    plastron: "#c9b56a",
  },
  {
    shell: "#4f4a33",
    light: "#75694a",
    seam: "#2a261a",
    line: "#9f9460",
    skin: "#56594a",
    stripe: "#b9b98a",
    ear: null,
    plastron: "#b39c62",
  },
];

function shellSprite(v: number, ppu: number): SpriteDef {
  const T = TURTLES[v]!;
  const W = 50;
  const H = 42;
  const c = canvas(W * ppu, H * ppu);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(c.width, c.height);
  const d = img.data;
  const base = hex(T.shell);
  const light = hex(T.light);
  const seam = hex(T.seam);
  const mark = hex(T.line);
  const centers: [number, number][] = [
    [14.5, 0],
    [7.2, 0],
    [0, 0],
    [-7.2, 0],
    [-14.2, 0],
  ];
  for (const x of [10.5, 3.5, -3.5, -10.5]) centers.push([x, 10.8], [x, -10.8]);
  for (let py = 0; py < c.height; py++)
    for (let px = 0; px < c.width; px++) {
      const x = (px + 0.5) / ppu - W / 2;
      const y = (py + 0.5) / ppu - H / 2;
      const rx = 22 * (1 + (x < 0 ? 0.02 : 0));
      const ry = 17.6 * (1 + (x < 0 ? (-x / rx) * 0.07 : 0));
      const th = Math.atan2(y / ry, x / rx);
      const serr = Math.abs(Math.cos(th)) > 0.5 && x < 0 ? 0.35 * Math.abs(Math.sin(th * 12)) : 0;
      const rr = Math.hypot(x / rx, y / ry);
      const edge = (1 - rr) * Math.min(rx, ry) + serr;
      if (edge < -0.8) continue;
      const cov = clamp01((edge + 0.5) * ppu * 0.6);
      const j = (py * c.width + px) * 4;
      let d1 = 1e9;
      let d2 = 1e9;
      let ci = 0;
      for (let k = 0; k < centers.length; k++) {
        const dx = (x - centers[k]![0]) * 1.05;
        const dy = y - centers[k]![1];
        const dd = Math.hypot(dx, dy);
        if (dd < d1) {
          d2 = d1;
          d1 = dd;
          ci = k;
        } else if (dd < d2) d2 = dd;
      }
      const marginal = rr > 0.82;
      let s = marginal
        ? 1 - smooth(0.02, 0.05, Math.abs(Math.sin(th * 12 + 0.26)))
        : 1 - smooth(0.5, 0.68, d2 - d1);
      if (marginal) s = Math.max(s, 1 - smooth(0, 0.02, Math.abs(rr - 0.82) * 4));
      const center = marginal || d2 - d1 > 3 ? 0 : 1;
      const lv = LEVELS[Math.min(LAST, Math.floor(rr * LEVELS.length))]!;
      let c0 = mix(base[0], light[0], center) * lv;
      let c1 = mix(base[1], light[1], center) * lv;
      let c2 = mix(base[2], light[2], center) * lv;
      const ang = Math.atan2(y - centers[ci]![1], x - centers[ci]![0]);
      const mk =
        !marginal && ci >= 5
          ? smooth(0.86, 0.92, Math.sin(ang * 3 + d1 * 0.55 + ci)) * smooth(1.8, 2.3, d1) * 0.75
          : marginal
            ? smooth(0.6, 0.9, Math.sin(th * 24 + 1.5)) * 0.5
            : 0;
      c0 = mix(c0, mark[0], mk * 0.55);
      c1 = mix(c1, mark[1], mk * 0.55);
      c2 = mix(c2, mark[2], mk * 0.5);
      c0 = mix(c0, seam[0], s * 0.85);
      c1 = mix(c1, seam[1], s * 0.85);
      c2 = mix(c2, seam[2], s * 0.85);
      d[j] = c0;
      d[j + 1] = c1;
      d[j + 2] = c2;
      d[j + 3] = cov * 255;
    }
  inkEdge(d, c.width, c.height, ppu, 0.55, 0.8);
  ctx.putImageData(img, 0, 0);
  return def(c, ppu, 0.5, 0.5);
}

function skinPaint(
  ctx: CanvasRenderingContext2D,
  T: TurtleSkin,
  path: Path2D,
  len: number,
  stripes: number[],
): void {
  ctx.fillStyle = T.skin;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  for (const sy of stripes) {
    ctx.beginPath();
    ctx.moveTo(-2, sy);
    ctx.bezierCurveTo(len * 0.3, sy * 1.15, len * 0.7, sy * 0.75, len + 1, sy * 0.35);
    ctx.strokeStyle = T.stripe;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,.16)";
  ctx.fillRect(-3, -8, len + 6, 5.5);
  ctx.fillStyle = "rgba(0,0,0,.24)";
  ctx.fillRect(-3, 2.5, len + 6, 10);
  ctx.restore();
  ctx.strokeStyle = line(1);
  ctx.lineWidth = 0.5;
  ctx.stroke(path);
}

interface TurtleParts {
  shell: SpriteDef;
  head: SpriteDef;
  front: SpriteDef;
  back: SpriteDef;
  tail: SpriteDef;
}

function turtleSprites(v: number, ppu = 4): TurtleParts {
  const T = TURTLES[v]!;
  let c = canvas(19 * ppu, 12 * ppu);
  let ctx = c.getContext("2d")!;
  ctx.scale(ppu, ppu);
  ctx.translate(1, 6);
  ctx.scale(1.12, 1.12);
  let p = new Path2D();
  p.moveTo(0, -2.6);
  p.bezierCurveTo(3, -2.9, 6, -4.3, 9.6, -4);
  p.bezierCurveTo(13, -3.6, 15.2, -1.7, 15.7, 0);
  p.bezierCurveTo(15.2, 1.7, 13, 3.6, 9.6, 4);
  p.bezierCurveTo(6, 4.3, 3, 2.9, 0, 2.6);
  p.closePath();
  skinPaint(ctx, T, p, 16, [-2.3, -0.8, 0.8, 2.3]);
  for (const s of [-1, 1]) {
    if (T.ear) {
      ctx.beginPath();
      ctx.ellipse(8.2, s * 3.1, 1.9, 0.7, s * 0.15, 0, TAU);
      ctx.fillStyle = T.ear;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(11.6, s * 2.6, 1.05, 0, TAU);
    ctx.fillStyle = "#d6c56d";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(11.7, s * 2.62, 0.66, 0, TAU);
    ctx.fillStyle = "#141712";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(11.9, s * 2.62 - 0.25, 0.2, 0, TAU);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(15, s * 0.55, 0.22, 0, TAU);
    ctx.fillStyle = "rgba(20,24,16,.6)";
    ctx.fill();
  }
  const head = def(c, ppu, 1 / 19, 0.5);

  const leg = (len: number, wide: number, claws: number): SpriteDef => {
    const c2 = canvas((len + 3) * ppu, (wide + 5) * ppu);
    const x2 = c2.getContext("2d")!;
    x2.scale(ppu, ppu);
    x2.translate(1, (wide + 5) / 2);
    const q = new Path2D();
    q.moveTo(0, -3.4);
    q.bezierCurveTo(len * 0.3, -3.5, len * 0.45, -2.9, len * 0.58, -2.9);
    q.bezierCurveTo(len * 0.75, -wide * 0.55, len + 0.4, -wide * 0.48, len + 0.6, 0);
    q.bezierCurveTo(len + 0.4, wide * 0.48, len * 0.75, wide * 0.55, len * 0.58, 2.9);
    q.bezierCurveTo(len * 0.45, 2.9, len * 0.3, 3.5, 0, 3.4);
    q.closePath();
    skinPaint(x2, T, q, len, [-1.3, 1.3]);
    for (let k = 0; k < claws; k++) {
      const yy = (k - (claws - 1) / 2) * ((wide * 0.78) / claws);
      x2.beginPath();
      x2.moveTo(len * 0.9, yy);
      x2.lineTo(len + 1.3, yy * 1.15);
      x2.strokeStyle = "rgba(226,216,180,.8)";
      x2.lineWidth = 0.32;
      x2.lineCap = "round";
      x2.stroke();
    }
    return def(c2, ppu, 1 / (len + 3), 0.5);
  };

  c = canvas(9 * ppu, 5 * ppu);
  ctx = c.getContext("2d")!;
  ctx.scale(ppu, ppu);
  ctx.translate(0.5, 2.5);
  p = new Path2D();
  p.moveTo(0, -1.8);
  p.quadraticCurveTo(5, -1.2, 8, 0);
  p.quadraticCurveTo(5, 1.2, 0, 1.8);
  p.closePath();
  skinPaint(ctx, T, p, 8, [0]);

  return {
    shell: shellSprite(v, ppu),
    head,
    front: leg(11, 8.2, 5),
    back: leg(9, 8.6, 4),
    tail: def(c, ppu, 0.5 / 9, 0.5),
  };
}

interface ButterflySkin {
  fill: [string, string];
  vein: string;
  tail?: boolean;
}

const BUTTERFLIES: ButterflySkin[] = [
  { fill: ["#f7f4ea", "#efe9d8"], vein: "rgba(120,120,105,.35)" },
  { fill: ["#f6dc6c", "#f1c94c"], vein: "rgba(150,110,40,.35)" },
  { fill: ["#26292a", "#1b1d1e"], vein: "rgba(0,0,0,.4)", tail: true },
];

function wingPaths(tail: boolean): { fore: Path2D; hind: Path2D } {
  const fore = new Path2D();
  fore.moveTo(0, -2.5);
  fore.bezierCurveTo(8, -12, 22, -23, 33, -22);
  fore.bezierCurveTo(36, -20, 34, -11, 30, -4);
  fore.bezierCurveTo(27, 0, 20, 2, 12, 2);
  fore.bezierCurveTo(6, 2, 2, 1, 0, 0.5);
  fore.closePath();
  const hind = new Path2D();
  hind.moveTo(0, 0);
  hind.bezierCurveTo(8, -1, 20, -1, 25, 6);
  if (tail) {
    hind.bezierCurveTo(26, 12, 22, 18, 19, 21);
    hind.bezierCurveTo(18.5, 25, 19, 30, 17, 33);
    hind.bezierCurveTo(15.4, 30, 15.2, 26, 15.4, 23);
    hind.bezierCurveTo(11, 25, 5, 20, 2, 12);
  } else {
    hind.bezierCurveTo(29, 13, 23, 23, 15, 25);
    hind.bezierCurveTo(7, 25, 3, 18, 1.5, 11);
  }
  hind.closePath();
  return { fore, hind };
}

function butterflySprites(species: number, ppu = 3.2): { wing: SpriteDef; body: SpriteDef } {
  const B = BUTTERFLIES[species]!;
  const c = canvas(38 * ppu, 58 * ppu);
  const ctx = c.getContext("2d")!;
  ctx.scale(ppu, ppu);
  ctx.translate(0.5, 24);
  const { fore, hind } = wingPaths(!!B.tail);
  const paint = (path: Path2D, isFore: boolean): void => {
    ctx.fillStyle = isFore ? B.fill[0] : B.fill[1];
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    if (species === 0 && isFore) {
      ctx.fillStyle = "rgba(40,40,38,.9)";
      ctx.beginPath();
      ctx.ellipse(32, -20, 8.5, 7.5, 0.5, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(20, -8, 2.4, 0, TAU);
      ctx.fillStyle = "rgba(45,45,42,.85)";
      ctx.fill();
    }
    if (species === 0 && !isFore) {
      ctx.beginPath();
      ctx.arc(18, 1, 1.6, 0, TAU);
      ctx.fillStyle = "rgba(60,60,55,.5)";
      ctx.fill();
    }
    if (species === 1) {
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "rgba(92,62,28,.55)";
      ctx.stroke(path);
      if (isFore) {
        ctx.beginPath();
        ctx.arc(17, -9, 1.3, 0, TAU);
        ctx.fillStyle = "rgba(80,50,20,.8)";
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(13, 9, 1.6, 0, TAU);
        ctx.fillStyle = "rgba(232,130,40,.85)";
        ctx.fill();
      }
    }
    if (species === 2) {
      ctx.fillStyle = "rgba(240,234,212,.92)";
      if (isFore)
        for (let k = 0; k < 6; k++) {
          ctx.beginPath();
          ctx.ellipse(27 - k * 0.6, -17 + k * 3.2, 1.3, 0.9, 0.4, 0, TAU);
          ctx.fill();
        }
      else {
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.ellipse(6 + k * 3.3, 6 + k * 0.9, 1.9, 3.2, -0.5, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(196,72,50,.9)";
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(11 + k * 3.6, 18.5 - k * 3, 1.05, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(120,160,190,.55)";
        ctx.beginPath();
        ctx.arc(20.5, 12, 1.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.strokeStyle = B.vein;
    ctx.lineWidth = 0.32;
    const vs: [number, number][] = isFore
      ? [
          [-0.95, 34],
          [-0.75, 36],
          [-0.55, 34],
          [-0.35, 31],
          [-0.15, 28],
          [0.05, 22],
        ]
      : [
          [0.05, 26],
          [0.35, 27],
          [0.7, 27],
          [1.05, 26],
          [1.35, 22],
        ];
    for (const [a, l] of vs) {
      ctx.beginPath();
      ctx.moveTo(1, isFore ? -0.5 : 1);
      ctx.quadraticCurveTo(
        Math.cos(a) * l * 0.5,
        Math.sin(a) * l * 0.5 + (isFore ? -1 : 1),
        Math.cos(a) * l,
        Math.sin(a) * l,
      );
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = line(1);
    ctx.lineWidth = 0.4;
    ctx.stroke(path);
  };
  paint(hind, false);
  paint(fore, true);
  const wing = def(c, ppu, 0.5 / 38, 24 / 58);

  const b = canvas(10 * ppu, 30 * ppu);
  const x = b.getContext("2d")!;
  x.scale(ppu, ppu);
  x.translate(5, 11);
  x.strokeStyle = species === 2 ? "#2a2a28" : "#4b4a40";
  x.lineWidth = 0.35;
  x.lineCap = "round";
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(s * 0.4, -4.4);
    x.quadraticCurveTo(s * 1.6, -8, s * 3.2, -10.2);
    x.stroke();
    x.beginPath();
    x.arc(s * 3.3, -10.3, 0.5, 0, TAU);
    x.fillStyle = x.strokeStyle;
    x.fill();
  }
  x.fillStyle = species === 1 ? "#8a7a4a" : "#5a574c";
  x.beginPath();
  x.ellipse(0, -3.6, 1.2, 1.1, 0, 0, TAU);
  x.fill();
  x.beginPath();
  x.ellipse(0, 0.2, 1.55, 3, 0, 0, TAU);
  x.fill();
  x.beginPath();
  x.moveTo(-1.1, 2.4);
  x.quadraticCurveTo(-1.2, 10, 0, 15.5);
  x.quadraticCurveTo(1.2, 10, 1.1, 2.4);
  x.closePath();
  x.fill();
  x.strokeStyle = "rgba(230,220,190,.25)";
  x.lineWidth = 0.2;
  for (let k = 0; k < 5; k++) {
    x.beginPath();
    x.moveTo(-1, 4 + k * 2.2);
    x.lineTo(1, 4 + k * 2.2);
    x.stroke();
  }
  return { wing, body: def(b, ppu, 0.5, 11 / 30) };
}

interface DragonflySkin {
  thorax: string;
  abdomen: string;
  eye: string;
  vein: string;
}

const DRAGONFLIES: DragonflySkin[] = [
  { thorax: "#b8412c", abdomen: "#d24b2f", eye: "#7a2418", vein: "rgba(110,60,35,.55)" },
  { thorax: "#5c8a3a", abdomen: "#3f8fb0", eye: "#2f6f5a", vein: "rgba(40,60,70,.55)" },
];

function dragonflySprites(species: number, ppu = 4): { body: SpriteDef; wing: SpriteDef } {
  const D = DRAGONFLIES[species]!;
  const b = canvas(10 * ppu, 40 * ppu);
  const x = b.getContext("2d")!;
  x.scale(ppu, ppu);
  x.translate(5, 9);
  x.lineJoin = "round";
  const abd = new Path2D();
  abd.moveTo(-1, 2);
  abd.bezierCurveTo(-1.1, 12, -0.8, 22, -0.45, 29);
  abd.lineTo(0.45, 29);
  abd.bezierCurveTo(0.8, 22, 1.1, 12, 1, 2);
  abd.closePath();
  x.fillStyle = D.abdomen;
  x.fill(abd);
  x.strokeStyle = line(1);
  x.lineWidth = 0.3;
  x.stroke(abd);
  x.strokeStyle = line(0.7);
  x.lineWidth = 0.22;
  for (let k = 0; k < 9; k++) {
    const yy = 4 + k * 2.8;
    const hw = 1 - k * 0.06;
    x.beginPath();
    x.moveTo(-hw, yy);
    x.lineTo(hw, yy);
    x.stroke();
  }
  x.fillStyle = D.thorax;
  x.beginPath();
  x.ellipse(0, 0, 2, 3.2, 0, 0, TAU);
  x.fill();
  x.strokeStyle = line(1);
  x.lineWidth = 0.3;
  x.stroke();
  for (const s of [-1, 1]) {
    x.fillStyle = D.eye;
    x.beginPath();
    x.ellipse(s * 1.2, -4.2, 1.6, 1.7, 0, 0, TAU);
    x.fill();
    x.fillStyle = "#fff";
    x.beginPath();
    x.arc(s * 1.2 + 0.5, -4.8, 0.42, 0, TAU);
    x.fill();
  }
  const w = canvas(18 * ppu, 5 * ppu);
  const y = w.getContext("2d")!;
  y.scale(ppu, ppu);
  y.translate(0.5, 2.5);
  const p = new Path2D();
  p.moveTo(0, -0.5);
  p.bezierCurveTo(4, -2, 13, -2.1, 16.6, -0.9);
  p.quadraticCurveTo(17.4, 0, 16.4, 0.8);
  p.bezierCurveTo(12, 1.9, 4, 1.6, 0, 0.6);
  p.closePath();
  y.fillStyle = "rgba(236,242,246,.42)";
  y.fill(p);
  y.save();
  y.clip(p);
  y.strokeStyle = D.vein;
  y.lineWidth = 0.16;
  for (const k of [-1, 0, 1]) {
    y.beginPath();
    y.moveTo(0, k * 0.2);
    y.quadraticCurveTo(8, k * 0.7, 17, k * 0.45);
    y.stroke();
  }
  for (let k = 1; k < 13; k++) {
    y.beginPath();
    y.moveTo(k * 1.4, -2);
    y.lineTo(k * 1.4 + 0.2, 2);
    y.stroke();
  }
  y.fillStyle = "rgba(40,30,25,.8)";
  y.fillRect(14.4, -1.05, 1.3, 0.6);
  y.restore();
  y.strokeStyle = line(1);
  y.lineWidth = 0.18;
  y.stroke(p);
  return { body: def(b, ppu, 0.5, 9 / 40), wing: def(w, ppu, 0.5 / 18, 0.5) };
}

interface CrabSkin {
  shell: string;
  light: string;
  groove: string;
  claw: string;
  tip: string;
  leg: string;
  eye: string;
}

const CRABS: CrabSkin[] = [
  {
    shell: "#7a3620",
    light: "#b4643c",
    groove: "#4a1c10",
    claw: "#b3502c",
    tip: "#ecd2a8",
    leg: "#8c4428",
    eye: "#1b1310",
  },
  {
    shell: "#57542f",
    light: "#8a8350",
    groove: "#2e2c16",
    claw: "#9b5a34",
    tip: "#e2cfa0",
    leg: "#5f5a33",
    eye: "#15140d",
  },
];

function crabSprites(v: number, ppu = 6): { body: SpriteDef; leg: SpriteDef; claw: SpriteDef } {
  const C = CRABS[v]!;
  const bc = canvas(12 * ppu, 14 * ppu);
  const x = bc.getContext("2d")!;
  x.scale(ppu, ppu);
  x.translate(6, 7);
  const p = new Path2D();
  p.moveTo(4.9, -5.6);
  p.bezierCurveTo(5.6, -3, 5.4, 3, 4.9, 5.6);
  p.bezierCurveTo(2.4, 6.4, -2.6, 5.6, -4.4, 3.4);
  p.bezierCurveTo(-5.4, 1.4, -5.4, -1.4, -4.4, -3.4);
  p.bezierCurveTo(-2.6, -5.6, 2.4, -6.4, 4.9, -5.6);
  p.closePath();
  x.fillStyle = C.shell;
  x.fill(p);
  x.save();
  x.clip(p);
  x.fillStyle = C.light;
  x.beginPath();
  x.ellipse(2.4, -0.6, 3.6, 4.4, 0, 0, TAU);
  x.fill();
  x.strokeStyle = C.groove;
  x.lineWidth = 0.45;
  x.beginPath();
  x.moveTo(-0.4, -2.6);
  x.quadraticCurveTo(0.4, 0, -0.4, 2.6);
  x.moveTo(1.8, -2.2);
  x.quadraticCurveTo(0.2, -1.4, -1.8, -2.2);
  x.moveTo(1.8, 2.2);
  x.quadraticCurveTo(0.2, 1.4, -1.8, 2.2);
  x.stroke();
  x.restore();
  x.strokeStyle = line(1);
  x.lineWidth = 0.35;
  x.stroke(p);
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(5.4, s * 2.2, 0.8, 0.6, 0, 0, TAU);
    x.fillStyle = C.eye;
    x.fill();
    x.beginPath();
    x.arc(5.6, s * 2.2 - 0.2, 0.2, 0, TAU);
    x.fillStyle = "rgba(255,255,255,.7)";
    x.fill();
  }
  const body = def(bc, ppu, 0.5, 0.5);

  const lc = canvas(9 * ppu, 5 * ppu);
  const lx = lc.getContext("2d")!;
  lx.scale(ppu, ppu);
  lx.translate(0, 1.4);
  lx.lineCap = "round";
  lx.lineJoin = "round";
  lx.strokeStyle = C.leg;
  lx.lineWidth = 1.25;
  lx.beginPath();
  lx.moveTo(0.3, 0);
  lx.lineTo(4.4, -0.25);
  lx.stroke();
  lx.lineWidth = 0.9;
  lx.beginPath();
  lx.moveTo(4.4, -0.25);
  lx.lineTo(7, 1.7);
  lx.stroke();
  lx.strokeStyle = C.groove;
  lx.lineWidth = 0.55;
  lx.beginPath();
  lx.moveTo(6.6, 1.4);
  lx.lineTo(8.1, 3);
  lx.stroke();
  lx.fillStyle = C.light;
  lx.beginPath();
  lx.arc(4.4, -0.25, 0.5, 0, TAU);
  lx.fill();
  lx.strokeStyle = "rgba(255,230,190,.25)";
  lx.lineWidth = 0.3;
  lx.beginPath();
  lx.moveTo(0.6, -0.4);
  lx.lineTo(4, -0.6);
  lx.stroke();
  const leg = def(lc, ppu, 0, 1.4 / 5);

  const cc = canvas(9 * ppu, 6 * ppu);
  const cx = cc.getContext("2d")!;
  cx.scale(ppu, ppu);
  cx.translate(0.2, 3);
  cx.strokeStyle = C.claw;
  cx.lineCap = "round";
  cx.lineWidth = 1.1;
  cx.beginPath();
  cx.moveTo(0, 0);
  cx.lineTo(3, 0.4);
  cx.stroke();
  cx.fillStyle = C.claw;
  cx.beginPath();
  cx.ellipse(4.6, 0.5, 2, 1.55, -0.15, 0, TAU);
  cx.fill();
  cx.save();
  cx.clip();
  cx.fillStyle = C.light;
  cx.fillRect(2.6, -1.7, 4.4, 1.5);
  cx.restore();
  cx.fillStyle = C.tip;
  cx.beginPath();
  cx.moveTo(6, -0.5);
  cx.quadraticCurveTo(8.4, -1.2, 8.6, 0.2);
  cx.quadraticCurveTo(7.6, -0.1, 6.2, 0.3);
  cx.closePath();
  cx.fill();
  cx.beginPath();
  cx.moveTo(6, 1.2);
  cx.quadraticCurveTo(8, 2.1, 8.3, 0.9);
  cx.quadraticCurveTo(7.3, 1, 6.1, 0.6);
  cx.closePath();
  cx.fill();
  cx.strokeStyle = line(1);
  cx.lineWidth = 0.25;
  cx.beginPath();
  cx.ellipse(4.6, 0.5, 2, 1.55, -0.15, 0, TAU);
  cx.stroke();
  const claw = def(cc, ppu, 0.02, 0.5);

  return { body, leg, claw };
}

export function petalSprite(ppu = 4): SpriteDef {
  const c = canvas(20 * ppu, 10 * ppu);
  const ctx = c.getContext("2d")!;
  ctx.scale(ppu, ppu);
  ctx.translate(1, 5);
  const p = new Path2D();
  p.moveTo(0, 0);
  p.bezierCurveTo(3, -4.2, 12, -4.6, 18, 0);
  p.bezierCurveTo(12, 4.6, 3, 4.2, 0, 0);
  p.closePath();
  ctx.fillStyle = "#f4e3e6";
  ctx.fill(p);
  ctx.save();
  ctx.clip(p);
  ctx.fillStyle = "#e493a8";
  ctx.fillRect(12, -6, 7, 12);
  ctx.strokeStyle = "rgba(205,120,145,.35)";
  ctx.lineWidth = 0.2;
  for (let k = -3; k <= 3; k++) {
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.quadraticCurveTo(9, k * 1.1, 18, k * 0.3);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = line(1);
  ctx.lineWidth = 0.4;
  ctx.stroke(p);
  return def(c, ppu, 0.5, 0.5);
}

export const TURTLE_COUNT = TURTLES.length;
export const BUTTERFLY_COUNT = BUTTERFLIES.length;
export const DRAGONFLY_COUNT = DRAGONFLIES.length;
export const CRAB_COUNT = CRABS.length;

export function creatureSprites(): SpriteSet {
  const s: SpriteSet = { petal: petalSprite() };
  for (let v = 0; v < TURTLE_COUNT; v++) {
    const t = turtleSprites(v);
    for (const [k, d] of Object.entries(t)) s[`turtle${v}_${k}`] = d;
  }
  for (let b = 0; b < BUTTERFLY_COUNT; b++) {
    const t = butterflySprites(b);
    s[`bf${b}_wing`] = t.wing;
    s[`bf${b}_body`] = t.body;
  }
  for (let d = 0; d < DRAGONFLY_COUNT; d++) {
    const t = dragonflySprites(d);
    s[`df${d}_wing`] = t.wing;
    s[`df${d}_body`] = t.body;
  }
  for (let v = 0; v < CRAB_COUNT; v++) {
    const t = crabSprites(v);
    for (const [k, d] of Object.entries(t)) s[`crab${v}_${k}`] = d;
  }
  return s;
}
