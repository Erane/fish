import type { SanitizedSave } from "../core/types.ts";
import type { PondPack } from "../core/pack.ts";

const DB_NAME = "pond";
const DB_VERSION = 2;
const STATE = "state";
const PACKS = "packs";
const ASSETS = "assets";
const SAVE_KEY = "save";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!opening)
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of [STATE, PACKS, ASSETS])
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  return opening;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(store: string, key: string, value: unknown): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value, key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function get<T>(store: string, key: string): Promise<T | undefined> {
  const db = await open();
  const tx = db.transaction(store, "readonly");
  return request(tx.objectStore(store).get(key) as IDBRequest<T | undefined>);
}

async function del(store: string, key: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function keys(store: string): Promise<string[]> {
  const db = await open();
  const tx = db.transaction(store, "readonly");
  return request(tx.objectStore(store).getAllKeys() as IDBRequest<string[]>);
}

export const loadSave = (): Promise<SanitizedSave | null> =>
  get<SanitizedSave>(STATE, SAVE_KEY).then((v) => v ?? null);
export const writeSave = (save: SanitizedSave): Promise<void> => put(STATE, SAVE_KEY, save);

export const loadPack = (id: string): Promise<PondPack | undefined> => get<PondPack>(PACKS, id);
export const writePack = (pack: PondPack): Promise<void> => put(PACKS, pack.id, pack);
export const deletePack = (id: string): Promise<void> => del(PACKS, id);
export const listPackIds = (): Promise<string[]> => keys(PACKS);

export const loadAsset = (id: string): Promise<Blob | undefined> => get<Blob>(ASSETS, id);
export const writeAsset = (id: string, blob: Blob): Promise<void> => put(ASSETS, id, blob);
export const deleteAsset = (id: string): Promise<void> => del(ASSETS, id);
