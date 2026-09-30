import { pickSeason, seasonForDate } from "../core/pack.ts";
import type { PondPack, Season, SeasonAsset } from "../core/pack.ts";
import { SKIN_SPECIES, resolveSkinBinding } from "../core/skins.ts";
import type { SkinBindings, SkinSpecies } from "../core/skins.ts";
import {
  deleteAsset,
  deletePack,
  listPackIds,
  loadAsset,
  loadPack,
  loadSkin,
  writeAsset,
  writePack,
} from "./db.ts";

export interface ResolvedPack {
  pack: PondPack;
  season: Season;
  asset: SeasonAsset;
  image: HTMLImageElement;
  skins: Partial<Record<SkinSpecies, HTMLImageElement>>;
}

export interface SeasonAssetPlan {
  overwrite: Season[];
  keep: Season[];
  remove: Season[];
}

export function seasonAssetId(packId: string, season: Season): string {
  return `asset-${packId}-${season}`;
}

export function planSeasonAssets(
  existing: PondPack | undefined,
  next: PondPack,
  files: Partial<Record<Season, Blob>>,
): SeasonAssetPlan {
  const seasons = Object.keys(next.seasons) as Season[];
  const stored = existing ? (Object.keys(existing.seasons) as Season[]) : [];
  return {
    overwrite: seasons.filter((season) => files[season]),
    keep: seasons.filter((season) => !files[season] && existing?.seasons[season]),
    remove: stored.filter((season) => !next.seasons[season]),
  };
}

export async function importPack(
  pack: PondPack,
  files: Partial<Record<Season, Blob>>,
): Promise<PondPack> {
  const existing = await loadPack(pack.id);
  const plan = planSeasonAssets(existing, pack, files);
  const images: Partial<Record<Season, string>> = {};
  for (const season of plan.overwrite) {
    const id = seasonAssetId(pack.id, season);
    await writeAsset(id, files[season]!);
    images[season] = id;
  }
  for (const season of plan.keep) {
    const asset = existing?.seasons[season];
    if (asset) images[season] = asset.image;
  }
  const seasons: PondPack["seasons"] = {};
  for (const [season, image] of Object.entries(images) as [Season, string][]) {
    const asset = pack.seasons[season];
    if (asset) seasons[season] = { ...asset, image };
  }
  if (!Object.keys(seasons).length) throw new Error("no season images");
  for (const season of plan.remove) {
    const asset = existing?.seasons[season];
    if (asset) await deleteAsset(asset.image);
  }
  const bound: PondPack = { ...pack, seasons };
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

export async function resolvePack(
  id: string,
  bindings?: SkinBindings,
  date = new Date(),
): Promise<ResolvedPack | null> {
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
    for (const species of SKIN_SPECIES) {
      const skinId = resolveSkinBinding(bindings, id, season, species);
      if (!skinId) continue;
      const record = await loadSkin(skinId);
      if (!record) continue;
      const img = await decode(record.blob).catch(() => null);
      if (img) skins[species] = img;
    }
    return { pack, season, asset, image, skins };
  } catch {
    return null;
  }
}
