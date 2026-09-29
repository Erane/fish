import { pickSeason, seasonForDate } from "../core/pack.ts";
import type { PackSprites, PondPack, Season, SeasonAsset } from "../core/pack.ts";
import {
  deleteAsset,
  deletePack,
  listPackIds,
  loadAsset,
  loadPack,
  writeAsset,
  writePack,
} from "./db.ts";

export type SkinSpecies = keyof PackSprites;

export interface ResolvedPack {
  pack: PondPack;
  season: Season;
  asset: SeasonAsset;
  image: HTMLImageElement;
  skins: Partial<Record<SkinSpecies, HTMLImageElement>>;
}

export function seasonAssetId(packId: string, season: Season): string {
  return `asset-${packId}-${season}`;
}

export function skinAssetId(packId: string, species: SkinSpecies): string {
  return `skin-${packId}-${species}`;
}

export function bindAssets(pack: PondPack, ids: Partial<Record<Season, string>>): PondPack {
  const seasons: PondPack["seasons"] = {};
  for (const [season, asset] of Object.entries(pack.seasons) as [Season, SeasonAsset][]) {
    const id = ids[season];
    seasons[season] = id ? { ...asset, image: id } : { ...asset };
  }
  return { ...pack, seasons };
}

export async function importPack(
  pack: PondPack,
  files: Partial<Record<Season, Blob>>,
  skins: Partial<Record<SkinSpecies, Blob>> = {},
): Promise<PondPack> {
  const ids: Partial<Record<Season, string>> = {};
  const seasons: PondPack["seasons"] = {};
  for (const [season, asset] of Object.entries(pack.seasons) as [Season, SeasonAsset][]) {
    const blob = files[season];
    if (!blob || !asset) continue;
    const id = seasonAssetId(pack.id, season);
    await writeAsset(id, blob);
    ids[season] = id;
    seasons[season] = asset;
  }
  if (!Object.keys(seasons).length) throw new Error("no images");
  const { sprites: _stale, ...bound } = bindAssets({ ...pack, seasons }, ids);
  const sprites: PackSprites = {};
  for (const [species, blob] of Object.entries(skins) as [SkinSpecies, Blob][]) {
    const id = skinAssetId(pack.id, species);
    await writeAsset(id, blob);
    sprites[species] = id;
  }
  const out: PondPack = Object.keys(sprites).length ? { ...bound, sprites } : bound;
  await writePack(out);
  return out;
}

export async function removePack(pack: PondPack): Promise<void> {
  await deletePack(pack.id);
  for (const asset of Object.values(pack.seasons)) if (asset) await deleteAsset(asset.image);
}

export async function listPacks(): Promise<PondPack[]> {
  const packs = await Promise.all((await listPackIds()).map((id) => loadPack(id)));
  return packs.filter((p): p is PondPack => !!p);
}

function decode(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

export async function resolvePack(id: string, date = new Date()): Promise<ResolvedPack | null> {
  const pack = await loadPack(id);
  if (!pack) return null;
  const season = pickSeason(pack.seasons, seasonForDate(date));
  const asset = pack.seasons[season];
  if (!asset) return null;
  const blob = await loadAsset(asset.image);
  if (!blob) return null;
  try {
    const image = await decode(blob);
    const skins: ResolvedPack["skins"] = {};
    for (const [species, id] of Object.entries(pack.sprites ?? {}) as [SkinSpecies, string][]) {
      const sb = await loadAsset(id);
      if (!sb) continue;
      const img = await decode(sb).catch(() => null);
      if (img) skins[species] = img;
    }
    return { pack, season, asset, image, skins };
  } catch {
    return null;
  }
}
