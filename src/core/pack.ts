import { clamp } from "./math.ts";

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export interface PackDepth {
  w: number;
  h: number;
  data: number[];
}

export interface PackObstacle {
  x: number;
  y: number;
  r: number;
}

export interface PackAnchors {
  crabHomes: { x: number; y: number; rx: number; ry: number }[];
  spots: number[][];
  buds: number[][];
}

export interface PackWater {
  polygon: number[];
  depth: PackDepth;
  obstacles: PackObstacle[];
  anchors: PackAnchors;
}

export interface SeasonTint {
  water: string;
  ambient?: string;
  deep?: string;
}

export interface SeasonAsset {
  image: string;
  tint: SeasonTint;
  floaters?: { kind: "petal" | "leaf" | "snow"; density: number; color: string }[];
}

export interface PackSprites {
  koi?: string;
  silvercarp?: string;
}

export interface PondPack {
  format: number;
  id: string;
  name: string;
  style: string;
  water: PackWater;
  seasons: Partial<Record<Season, SeasonAsset>>;
  sprites?: PackSprites;
}

const HEX = /^#[0-9a-f]{6}$/i;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function num(v: unknown, lo: number, hi: number): number | null {
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : null;
}

function polygon(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length < 6 || raw.length % 2 !== 0) return null;
  const out: number[] = [];
  for (const c of raw) {
    const n = num(c, 0, 1);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

function depth(raw: unknown): PackDepth | null {
  if (!isObj(raw)) return null;
  const w = Math.round(Number(raw.w));
  const h = Math.round(Number(raw.h));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w * h > 1 << 20) return null;
  if (!Array.isArray(raw.data) || raw.data.length !== w * h) return null;
  const data: number[] = [];
  for (const d of raw.data) {
    const n = num(d, 0, 1);
    if (n === null) return null;
    data.push(n);
  }
  return { w, h, data };
}

function obstacles(raw: unknown): PackObstacle[] {
  if (!Array.isArray(raw)) return [];
  const out: PackObstacle[] = [];
  for (const o of raw.slice(0, 64)) {
    if (!isObj(o)) continue;
    const x = num(o.x, 0, 1);
    const y = num(o.y, 0, 1);
    const r = num(o.r, 0, 1);
    if (x === null || y === null || r === null || r <= 0) continue;
    out.push({ x, y, r });
  }
  return out;
}

function pairs(raw: unknown, limit: number): number[][] {
  if (!Array.isArray(raw)) return [];
  const out: number[][] = [];
  for (const p of raw.slice(0, limit)) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = num(p[0], 0, 1);
    const y = num(p[1], 0, 1);
    if (x === null || y === null) continue;
    out.push([x, y]);
  }
  return out;
}

function anchors(raw: unknown): PackAnchors {
  const empty: PackAnchors = { crabHomes: [], spots: [], buds: [] };
  if (!isObj(raw)) return empty;
  const crabHomes: PackAnchors["crabHomes"] = [];
  if (Array.isArray(raw.crabHomes))
    for (const c of raw.crabHomes.slice(0, 64)) {
      if (!isObj(c)) continue;
      const x = num(c.x, 0, 1);
      const y = num(c.y, 0, 1);
      const rx = num(c.rx, 0, 1);
      const ry = num(c.ry, 0, 1);
      if (x === null || y === null || rx === null || ry === null || rx <= 0 || ry <= 0) continue;
      crabHomes.push({ x, y, rx, ry });
    }
  return { crabHomes, spots: pairs(raw.spots, 512), buds: pairs(raw.buds, 512) };
}

function tint(raw: unknown): SeasonTint | null {
  if (!isObj(raw) || typeof raw.water !== "string" || !HEX.test(raw.water)) return null;
  const out: SeasonTint = { water: raw.water };
  if (typeof raw.ambient === "string" && HEX.test(raw.ambient)) out.ambient = raw.ambient;
  if (typeof raw.deep === "string" && HEX.test(raw.deep)) out.deep = raw.deep;
  return out;
}

function seasons(raw: unknown): PondPack["seasons"] | null {
  if (!isObj(raw)) return null;
  const out: PondPack["seasons"] = {};
  let count = 0;
  for (const s of SEASONS) {
    const a = raw[s];
    if (!isObj(a) || typeof a.image !== "string" || !a.image) continue;
    const t = tint(a.tint);
    if (!t) continue;
    out[s] = { image: a.image.slice(0, 200), tint: t };
    count++;
  }
  return count > 0 ? out : null;
}

function sprites(raw: unknown): PackSprites | undefined {
  if (!isObj(raw)) return undefined;
  const out: PackSprites = {};
  if (typeof raw.koi === "string" && raw.koi) out.koi = raw.koi.slice(0, 200);
  if (typeof raw.silvercarp === "string" && raw.silvercarp)
    out.silvercarp = raw.silvercarp.slice(0, 200);
  return Object.keys(out).length ? out : undefined;
}

export function parsePack(raw: unknown): PondPack | null {
  if (!isObj(raw) || raw.format !== 1) return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (!isObj(raw.water)) return null;
  const poly = polygon(raw.water.polygon);
  const d = depth(raw.water.depth);
  const sea = seasons(raw.seasons);
  if (!poly || !d || !sea) return null;
  const out: PondPack = {
    format: 1,
    id: raw.id.slice(0, 200),
    name: typeof raw.name === "string" ? raw.name.slice(0, 80) : raw.id,
    style: typeof raw.style === "string" ? raw.style.slice(0, 40) : "cel",
    water: {
      polygon: poly,
      depth: d,
      obstacles: obstacles(raw.water.obstacles),
      anchors: anchors(raw.water.anchors),
    },
    seasons: sea,
  };
  const sp = sprites(raw.sprites);
  if (sp) out.sprites = sp;
  return out;
}

export function seasonForDate(date: Date): Season {
  const m = date.getMonth();
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
}

export function pickSeason(have: PondPack["seasons"], want: Season): Season {
  const idx = SEASONS.indexOf(want);
  for (let d = 0; d < SEASONS.length; d++) {
    for (const cand of [SEASONS[(idx - d + 4) % 4]!, SEASONS[(idx + d) % 4]!])
      if (have[cand]) return cand;
  }
  return want;
}
