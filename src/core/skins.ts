import { SEASONS } from "./pack.ts";
import type { Season } from "./pack.ts";

export const SKIN_SPECIES = ["koi", "silvercarp"] as const;
export type SkinSpecies = (typeof SKIN_SPECIES)[number];

export const SKIN_NAME_MAX = 20;
export const SKIN_UNNAMED = "未命名皮肤";

export function cleanSkinName(raw: string): string {
  return raw.trim().slice(0, SKIN_NAME_MAX);
}

export type SkinTier = "default" | Season;
export const SKIN_TIERS: readonly SkinTier[] = ["default", ...SEASONS];
export type SkinSlot = Partial<Record<SkinSpecies, string>>;
export type SkinPackBinding = Partial<Record<SkinTier, SkinSlot>>;
export type SkinBindings = Record<string, SkinPackBinding>;

export function resolveSkinBinding(
  bindings: SkinBindings | undefined,
  packId: string | undefined,
  season: Season,
  species: SkinSpecies,
): string | undefined {
  const perPack = packId ? bindings?.[packId] : undefined;
  return perPack?.[season]?.[species] ?? perPack?.default?.[species];
}

export function withSkinBinding(
  bindings: SkinBindings | undefined,
  packId: string,
  tier: SkinTier,
  species: SkinSpecies,
  skinId: string | undefined,
): SkinBindings | undefined {
  const slot: SkinSlot = { ...bindings?.[packId]?.[tier] };
  if (skinId) slot[species] = skinId;
  else delete slot[species];
  const tiers: SkinPackBinding = { ...bindings?.[packId] };
  if (Object.keys(slot).length) tiers[tier] = slot;
  else delete tiers[tier];
  const out: SkinBindings = { ...bindings };
  if (Object.keys(tiers).length) out[packId] = tiers;
  else delete out[packId];
  return Object.keys(out).length ? out : undefined;
}

export function pruneSkinBindings(
  bindings: SkinBindings | undefined,
  skinId: string,
): SkinBindings | undefined {
  if (!bindings) return undefined;
  const out: SkinBindings = {};
  for (const [packId, tiers] of Object.entries(bindings)) {
    const nextTiers: SkinPackBinding = {};
    for (const [tier, slot] of Object.entries(tiers) as [SkinTier, SkinSlot | undefined][]) {
      const nextSlot: SkinSlot = {};
      for (const species of SKIN_SPECIES) {
        const id = slot?.[species];
        if (id && id !== skinId) nextSlot[species] = id;
      }
      if (Object.keys(nextSlot).length) nextTiers[tier] = nextSlot;
    }
    if (Object.keys(nextTiers).length) out[packId] = nextTiers;
  }
  return Object.keys(out).length ? out : undefined;
}

export function prunePackBindings(
  bindings: SkinBindings | undefined,
  packId: string,
): SkinBindings | undefined {
  if (!bindings?.[packId]) return bindings;
  const out = { ...bindings };
  delete out[packId];
  return Object.keys(out).length ? out : undefined;
}
