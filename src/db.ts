// Base locale du téléphone (IndexedDB) : toutes les saisies passent d'abord ici.

export interface Rec {
  id: string;
  collection: string;
  data: Record<string, unknown>;
  updatedAt: number;
  deleted: boolean;
  author: string;
  dirty: 0 | 1; // 1 = pas encore envoyé au serveur
}

const NAME = 'ferme360';
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const store = db.createObjectStore('records', { keyPath: 'id' });
        store.createIndex('collection', 'collection');
        store.createIndex('dirty', 'dirty');
        db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: 'records' | 'meta', mode: IDBTransactionMode) {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function getRecord(id: string): Promise<Rec | undefined> {
  return wrap((await store('records', 'readonly')).get(id));
}

export async function putRecord(rec: Rec): Promise<void> {
  await wrap((await store('records', 'readwrite')).put(rec));
}

export async function listCollection(collection: string): Promise<Rec[]> {
  const all = await wrap<Rec[]>((await store('records', 'readonly')).index('collection').getAll(collection));
  return all.filter((r) => !r.deleted);
}

export async function dirtyRecords(limit: number): Promise<Rec[]> {
  return wrap<Rec[]>((await store('records', 'readonly')).index('dirty').getAll(1, limit));
}

export async function countDirty(): Promise<number> {
  return wrap((await store('records', 'readonly')).index('dirty').count(1));
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return wrap((await store('meta', 'readonly')).get(key));
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await wrap((await store('meta', 'readwrite')).put(value, key));
}

export async function listAll(): Promise<Rec[]> {
  const all = await wrap<Rec[]>((await store('records', 'readonly')).getAll());
  return all.filter((r) => !r.deleted);
}

// Efface tout sur ce téléphone (changement de personne qui se connecte)
export async function viderBase(): Promise<void> {
  await wrap((await store('records', 'readwrite')).clear());
  await wrap((await store('meta', 'readwrite')).clear());
}

// Supprime les enregistrements qui ne satisfont plus le critère (profil réduit)
export async function purgerSauf(garder: (r: Rec) => boolean): Promise<void> {
  const tous = await wrap<Rec[]>((await store('records', 'readonly')).getAll());
  for (const r of tous) if (!garder(r)) await wrap((await store('records', 'readwrite')).delete(r.id));
}

export async function exporterTout(): Promise<Rec[]> {
  return listAll();
}
