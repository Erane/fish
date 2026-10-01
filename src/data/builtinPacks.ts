import { parsePack, SEASONS } from "../core/pack.ts";
import type { PondPack, Season } from "../core/pack.ts";
import { addSeededTheme, loadPack, loadSeededThemes, removeSeededTheme } from "./db.ts";
import type { SeededTheme } from "./db.ts";
import { importPack, removePack } from "./packs.ts";

export interface BuiltinTheme {
  url: string;
  images: Partial<Record<Season, string>>;
}

export const THEME_MANIFEST_URL = "theme/themes.json";

export function parseThemeManifest(raw: unknown): BuiltinTheme[] | null {
  const themes = raw && typeof raw === "object" ? (raw as { themes?: unknown }).themes : null;
  if (!Array.isArray(themes)) return null;
  const out: BuiltinTheme[] = [];
  for (const entry of themes) {
    if (!entry || typeof entry !== "object") continue;
    const { url, images } = entry as { url?: unknown; images?: unknown };
    if (typeof url !== "string" || !url || !images || typeof images !== "object") continue;
    const files: Partial<Record<Season, string>> = {};
    for (const [season, image] of Object.entries(images as Record<string, unknown>))
      if ((SEASONS as readonly string[]).includes(season) && typeof image === "string" && image)
        files[season as Season] = image;
    if (!Object.keys(files).length) continue;
    out.push({ url, images: files });
  }
  return out;
}

export async function loadBuiltinThemes(
  fetchImpl: typeof fetch = fetch,
): Promise<BuiltinTheme[] | null> {
  try {
    const res = await fetchImpl(THEME_MANIFEST_URL);
    if (!res.ok) return null;
    return parseThemeManifest(await res.json());
  } catch {
    return null;
  }
}

export interface SeedSink {
  seeded(): Promise<SeededTheme[]>;
  mark(mark: SeededTheme): Promise<void>;
  remove(mark: SeededTheme): Promise<void>;
  importPack(pack: PondPack, files: Partial<Record<Season, Blob>>): Promise<PondPack>;
}

const dbSeedSink: SeedSink = {
  seeded: loadSeededThemes,
  mark: addSeededTheme,
  remove: async (mark) => {
    const pack = await loadPack(mark.id);
    if (pack) await removePack(pack);
    await removeSeededTheme(mark.url);
  },
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
  const marks = await sink.seeded();
  const enabled = new Set(themes.map((t) => t.url));
  const done = new Set<string>();
  for (const mark of marks) {
    if (enabled.has(mark.url)) {
      done.add(mark.url);
      continue;
    }
    try {
      await sink.remove(mark);
    } catch {
      continue;
    }
  }
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
    await sink.mark({ url: theme.url, id: pack.id });
    seeded.push(pack.id);
  }
  return seeded;
}

export async function seedBuiltinThemes(fetchImpl: typeof fetch = fetch): Promise<string[]> {
  try {
    const themes = await loadBuiltinThemes(fetchImpl);
    if (!themes) return [];
    return await seedBuiltinPacks(themes, fetchImpl, dbSeedSink);
  } catch {
    return [];
  }
}
