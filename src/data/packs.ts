import { pickSeason, seasonForDate } from "../core/pack.ts";
import type { PondPack, Season, SeasonAsset } from "../core/pack.ts";
import {
  deleteAsset,
  deletePack,
  listPackIds,
  loadAsset,
  loadPack,
  writeAsset,
  writePack,
} from "./db.ts";

export interface ResolvedPack {
  pack: PondPack;
  season: Season;
  asset: SeasonAsset;
  image: HTMLImageElement;
}

export function seasonAssetId(packId: string, season: Season): string {
  return `asset-${packId}-${season}`;
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
  const bound = bindAssets({ ...pack, seasons }, ids);
  await writePack(bound);
  return bound;
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
    return { pack, season, asset, image };
  } catch {
    return null;
  }
}
