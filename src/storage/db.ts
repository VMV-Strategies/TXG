// Local-first persistence on IndexedDB (no server). Private documents, facts and
// scenarios stay in this browser unless the user exports a backup.
export const DB_NAME = 'threex-vi';
export const DB_VERSION = 2;
export const STORES = ['scenarios', 'documents', 'blobs', 'chunks', 'settings', 'facts', 'meta'] as const;
export type StoreName = (typeof STORES)[number];

/** Schema migrations, applied in order inside onupgradeneeded. */
export const MIGRATIONS: Record<number, (db: IDBDatabase, tx: IDBTransaction) => void> = {
  1: (db) => {
    db.createObjectStore('scenarios', { keyPath: 'id' });
    db.createObjectStore('documents', { keyPath: 'id' });
    db.createObjectStore('blobs');
    const ch = db.createObjectStore('chunks', { keyPath: 'id' });
    ch.createIndex('docId', 'docId');
    db.createObjectStore('settings');
    db.createObjectStore('meta');
  },
  2: (db) => {
    if (!db.objectStoreNames.contains('facts')) db.createObjectStore('facts', { keyPath: 'id' });
  },
};

let dbp: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available in this browser.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction!;
      for (let v = (ev.oldVersion || 0) + 1; v <= DB_VERSION; v++) MIGRATIONS[v]?.(db, tx);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked by another open tab.'));
  });
  return dbp;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function put<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value as unknown, key);
  await done(tx);
}

export async function putMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (!values.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v as unknown);
  await done(tx);
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function getAllKeys(store: StoreName): Promise<IDBValidKey[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAllKeys());
}

export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await done(tx);
}

export async function deleteChunksForDoc(docId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('chunks', 'readwrite');
  const idx = tx.objectStore('chunks').index('docId');
  const keys = await wrap(idx.getAllKeys(docId));
  for (const k of keys) tx.objectStore('chunks').delete(k);
  await done(tx);
}

export async function clearStore(store: StoreName): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await done(tx);
}

/** Full-data deletion: removes every store and the database itself. */
export async function deleteEverything(): Promise<void> {
  try {
    const db = await openDb();
    db.close();
  } catch {
    /* ignore */
  }
  dbp = null;
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
    r.onblocked = () => res();
  });
  try {
    localStorage.removeItem('threex-ui');
  } catch {
    /* ignore */
  }
  if ('caches' in globalThis) {
    // Keep the app shell cache so the app still opens offline; user data lives only in IndexedDB.
  }
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error('Transaction aborted'));
  });
}

export interface StorageInfo {
  usage: number;
  quota: number;
  persisted: boolean | null;
  pct: number;
  warning: string | null;
}

export async function storageInfo(): Promise<StorageInfo> {
  const nav = globalThis.navigator as Navigator | undefined;
  if (!nav?.storage?.estimate) return { usage: 0, quota: 0, persisted: null, pct: 0, warning: 'This browser does not report storage capacity.' };
  const e = await nav.storage.estimate();
  const persisted = nav.storage.persisted ? await nav.storage.persisted() : null;
  const usage = e.usage ?? 0;
  const quota = e.quota ?? 0;
  const pct = quota ? usage / quota : 0;
  let warning: string | null = null;
  if (pct > 0.8) warning = 'Storage is more than 80% full. Export a backup and remove large documents.';
  else if (!persisted) warning = 'Storage is not marked persistent; the browser may clear it under pressure (Safari can remove data for sites not used for 7 days unless installed to the Home Screen). Export backups regularly.';
  return { usage, quota, persisted, pct, warning };
}

export async function requestPersistence(): Promise<boolean> {
  const nav = globalThis.navigator as Navigator | undefined;
  if (!nav?.storage?.persist) return false;
  return nav.storage.persist();
}
