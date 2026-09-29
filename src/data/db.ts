import type { SanitizedSave } from "../core/types.ts";

const DB_NAME = "pond";
const STORE = "state";
const KEY = "save";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!opening)
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
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

export async function loadSave(): Promise<SanitizedSave | null> {
  const db = await open();
  const tx = db.transaction(STORE, "readonly");
  const raw = await request(tx.objectStore(STORE).get(KEY) as IDBRequest<unknown>);
  return (raw as SanitizedSave | undefined) ?? null;
}

export async function writeSave(save: SanitizedSave): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(save, KEY);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
