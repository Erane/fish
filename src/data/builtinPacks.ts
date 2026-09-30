import { parsePack } from "../core/pack.ts";
import type { PondPack, Season } from "../core/pack.ts";
import { addSeededTheme, loadSeededThemes } from "./db.ts";
import { importPack } from "./packs.ts";

export interface BuiltinTheme {
  url: string;
  images: Partial<Record<Season, string>>;
}

export const BUILTIN_THEMES: readonly BuiltinTheme[] = [
  { url: "theme/autumn.json", images: { autumn: "theme/autumn.png" } },
];

export interface SeedSink {
  seeded(): Promise<string[]>;
  mark(url: string): Promise<void>;
  importPack(pack: PondPack, files: Partial<Record<Season, Blob>>): Promise<PondPack>;
}

const dbSeedSink: SeedSink = {
  seeded: loadSeededThemes,
  mark: addSeededTheme,
  importPack,
};

async function fetchPack(theme: BuiltinTheme, fetchImpl: typeof fetch): Promise<PondPack | null> {
  try {
    const res = await fetchImpl(theme.url);
    if (!res.ok) return null;
    return parsePack(await res.json());
  } catch {
    return null;
  }
}

async function fetchImages(
  theme: BuiltinTheme,
  fetchImpl: typeof fetch,
): Promise<Partial<Record<Season, Blob>>> {
  const files: Partial<Record<Season, Blob>> = {};
  for (const [season, url] of Object.entries(theme.images) as [Season, string][]) {
    try {
      const res = await fetchImpl(url);
      if (res.ok) files[season] = await res.blob();
    } catch {
      continue;
    }
  }
  return files;
}

export async function seedBuiltinPacks(
  themes: readonly BuiltinTheme[],
  fetchImpl: typeof fetch,
  sink: SeedSink,
): Promise<string[]> {
  const done = new Set(await sink.seeded());
  const seeded: string[] = [];
  for (const theme of themes) {
    if (done.has(theme.url)) continue;
    const pack = await fetchPack(theme, fetchImpl);
    if (!pack) continue;
    const files = await fetchImages(theme, fetchImpl);
    try {
      await sink.importPack(pack, files);
    } catch {
      continue;
    }
    await sink.mark(theme.url);
    seeded.push(pack.id);
  }
  return seeded;
}

export function seedBuiltinThemes(fetchImpl: typeof fetch = fetch): Promise<string[]> {
  return seedBuiltinPacks(BUILTIN_THEMES, fetchImpl, dbSeedSink).catch(() => []);
}
