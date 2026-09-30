import { cleanSkinName, SKIN_UNNAMED } from "../core/skins.ts";
import type { SkinSpecies } from "../core/skins.ts";
import {
  deleteSkin as dbDeleteSkin,
  loadSkins as dbLoadSkins,
  writeSkin as dbWriteSkin,
} from "./db.ts";

export interface SkinRecord {
  id: string;
  name: string;
  species: SkinSpecies;
  blob: Blob;
}

export const listSkins = (): Promise<SkinRecord[]> => dbLoadSkins();

export async function addSkin(name: string, species: SkinSpecies, blob: Blob): Promise<SkinRecord> {
  const record: SkinRecord = {
    id: `skin-${crypto.randomUUID()}`,
    name: cleanSkinName(name) || SKIN_UNNAMED,
    species,
    blob,
  };
  await dbWriteSkin(record);
  return record;
}

export async function editSkin(
  skin: SkinRecord,
  name: string,
  species: SkinSpecies,
): Promise<SkinRecord> {
  const next: SkinRecord = { ...skin, name: cleanSkinName(name) || skin.name, species };
  await dbWriteSkin(next);
  return next;
}

export const removeSkin = (id: string): Promise<void> => dbDeleteSkin(id);
