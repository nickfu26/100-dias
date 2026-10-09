// Where persisted() keeps data. Every value is saved with the time it was written, so on launch
// the newest copy wins whichever store it survived in:
//   idb    — IndexedDB, the source of truth.
//   mirror — a localStorage copy, written synchronously so it survives the app being killed
//            before an IndexedDB write commits.
//   legacy — the plain localStorage keys earlier builds wrote. Read once to migrate, never written
//            again, so they stay as a frozen fallback.

export interface Saved {
  at: number; // Date.now() of the write; 0 for legacy data
  v: unknown;
}

export interface Backend {
  name: 'idb' | 'mirror' | 'legacy';
  writable: boolean;
  /** undefined: nothing saved. Throws: couldn't read, so the contents are unknown. */
  read(key: string): Promise<Saved | undefined>;
  write(key: string, s: Saved): Promise<void>;
}

const isSaved = (x: unknown): x is Saved =>
  typeof x === 'object' && x !== null && typeof (x as Saved).at === 'number' && 'v' in x;

const DB = '100dias';
const STORE = 'kv';
const OPEN_TIMEOUT_MS = 4000;
let db: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  return (db ??= new Promise<IDBDatabase>((resolve, reject) => {
    // Some WebKit builds never settle the first open; don't hang the app on it.
    const timer = setTimeout(() => reject(new Error('IndexedDB open timed out')), OPEN_TIMEOUT_MS);
    const req = indexedDB.open(DB, 1);
    // Only ever adds the store. A future version must migrate, never delete it.
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const d = req.result;
      d.onversionchange = () => {
        d.close();
        db = null;
      };
      d.onclose = () => (db = null); // iOS drops connections in the background; reopen next time
      resolve(d);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error);
    };
  }).catch((e) => {
    db = null;
    throw e;
  }));
}

function idbOnce<R>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> {
  return openDb().then(
    (d) =>
      new Promise<R>((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      }),
  );
}

/** One retry on a fresh connection: iOS can drop the connection while the app is in the background. */
function idbRequest<R>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> {
  return idbOnce(mode, run).catch(() => {
    db = null;
    return idbOnce(mode, run);
  });
}

const hasIdb = () => typeof indexedDB !== 'undefined';

export const idb: Backend = {
  name: 'idb',
  writable: true,
  async read(key) {
    if (!hasIdb()) return undefined;
    const s = await idbRequest('readonly', (st) => st.get(key));
    if (s === undefined) return undefined;
    if (!isSaved(s)) throw new Error(`Unexpected IndexedDB value for ${key}`);
    return s;
  },
  async write(key, s) {
    if (!hasIdb()) return;
    await idbRequest('readwrite', (st) => st.put(s, key));
  },
};

const MIRROR = 'mirror:';

export const mirror: Backend = {
  name: 'mirror',
  writable: true,
  async read(key) {
    const raw = localStorage.getItem(MIRROR + key);
    if (raw === null) return undefined;
    const s: unknown = JSON.parse(raw);
    if (!isSaved(s)) throw new Error(`Unexpected mirror value for ${key}`);
    return s;
  },
  async write(key, s) {
    localStorage.setItem(MIRROR + key, JSON.stringify(s));
  },
};

/** The localStorage key the mirror uses, for cross-tab `storage` events. */
export const mirrorKey = (key: string) => MIRROR + key;
export const parseMirror = (raw: string | null): Saved | undefined => {
  if (raw === null) return undefined;
  try {
    const s: unknown = JSON.parse(raw);
    return isSaved(s) ? s : undefined;
  } catch {
    return undefined;
  }
};

export const legacy: Backend = {
  name: 'legacy',
  writable: false,
  async read(key) {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : { at: 0, v: JSON.parse(raw) };
  },
  async write() {},
};

export const DEFAULT_BACKENDS: Backend[] = [idb, mirror, legacy];

export const idbAvailable = hasIdb;
