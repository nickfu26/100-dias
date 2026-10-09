import { useSyncExternalStore } from 'react';
import { DEFAULT_BACKENDS, mirrorKey, parseMirror, type Backend, type Saved } from './durable';

/**
 * A tiny durable store usable from React (useSyncExternalStore) and plain code.
 * Values are small JSON (settings, progress). Saved data is loaded once at startup (see
 * loadAllStores in main.tsx); after that get/set are synchronous and every write is saved
 * immediately to IndexedDB plus a localStorage mirror (lib/durable.ts).
 *
 * Saved data is never overwritten with data we didn't load:
 * - a backend whose read failed is never written this session (its contents are unknown);
 * - if nothing could be loaded and any backend failed, the store is 'unknown' and saves nothing.
 */
export interface Store<T> {
  get(): T;
  set(update: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  /** Resolves once saved data has been loaded, or found unreadable. Never rejects. */
  loaded: Promise<void>;
  status(): StoreStatus;
}

/**
 * loading: not read yet. ready: loaded (or genuinely nothing saved) and saving.
 * unknown: saved data couldn't be read, so changes stay in memory only.
 */
export type StoreStatus = 'loading' | 'ready' | 'unknown';

export interface BackendHealth {
  read: 'ok' | 'failed' | 'unused';
  write: 'ok' | 'failed' | 'unused';
}
const health: Record<Backend['name'], BackendHealth> = {
  idb: { read: 'unused', write: 'unused' },
  mirror: { read: 'unused', write: 'unused' },
  legacy: { read: 'unused', write: 'unused' },
};
const registry: { key: string; store: Store<unknown> }[] = [];

const READ_TIMEOUT_MS = 5000;
function withTimeout<R>(p: Promise<R>, ms: number): Promise<R> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`read timed out after ${ms} ms`)), ms)));
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** For parse functions: reject anything that isn't a plain object, so junk counts as unreadable, not empty. */
export function requireObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Saved value is not an object');
  return raw as Record<string, unknown>;
}

export function persisted<T>(
  key: string,
  initial: T,
  parse: (raw: unknown) => T = (r) => r as T,
  backends: Backend[] = DEFAULT_BACKENDS,
): Store<T> {
  let value = initial;
  let lastAt = -1;
  let status: StoreStatus = 'loading';
  let changedWhileLoading = false;
  let writeTo: Backend[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  function save(s: Saved) {
    for (const b of writeTo) {
      // The mirror writes synchronously inside this call; IndexedDB commits a moment later.
      b.write(key, s).then(
        () => (health[b.name].write = 'ok'),
        (e) => {
          health[b.name].write = 'failed';
          console.warn(`[storage] ${b.name} write failed for ${key}`, e);
        },
      );
    }
  }

  async function load() {
    const results = await Promise.all(
      backends.map(async (b) => {
        try {
          const s = await withTimeout(b.read(key), READ_TIMEOUT_MS);
          health[b.name].read = health[b.name].read === 'failed' ? 'failed' : 'ok';
          return { b, ok: true as const, s: s && { at: s.at, v: parse(s.v) } };
        } catch (e) {
          health[b.name].read = 'failed';
          console.warn(`[storage] ${b.name} read failed for ${key}`, e);
          return { b, ok: false as const };
        }
      }),
    );
    const found = results.flatMap((r) => (r.ok && r.s ? [r.s] : []));
    const failed = results.some((r) => !r.ok);
    const best = found.reduce<(typeof found)[number] | undefined>((a, c) => (!a || c.at > a.at ? c : a), undefined);

    if (changedWhileLoading) {
      // Something changed the value before we knew what was saved; saving it could replace real data.
      status = 'unknown';
      console.warn(`[storage] ${key} changed before it loaded; not saving this session`);
      return;
    }
    // With a failed read, the unreadable store might hold newer data. Carry on only if a store that
    // every save goes to (so it's never behind) has the copy we loaded; the frozen legacy key doesn't count.
    const current = results.some((r) => r.ok && r.b.writable && r.s && best && r.s.at === best.at);
    if (failed && !current) {
      status = 'unknown'; // "couldn't read" is not "nothing saved"
      if (best) {
        value = best.v; // show what we have, but don't build on it
        notify();
      }
      return;
    }
    writeTo = results.filter((r) => r.ok && r.b.writable).map((r) => r.b);
    status = 'ready';
    if (!best) return;
    value = best.v;
    lastAt = best.at;
    // Bring stores that are behind (or empty, e.g. first launch after the move from localStorage) up to date.
    for (const r of results)
      if (r.ok && r.b.writable && (!r.s || r.s.at < best.at)) {
        const b = r.b;
        b.write(key, { at: best.at, v: best.v }).catch((e) => console.warn(`[storage] ${b.name} heal failed for ${key}`, e));
      }
    notify();
  }

  const loaded = load().catch((e) => {
    status = 'unknown';
    console.warn(`[storage] ${key} failed to load`, e);
  });

  // Another tab (or the installed app and a browser tab) saved a newer value.
  if (typeof window !== 'undefined' && backends.includes(DEFAULT_BACKENDS[1]!)) {
    window.addEventListener('storage', (e) => {
      if (e.key !== mirrorKey(key) || status !== 'ready') return;
      const s = parseMirror(e.newValue);
      if (!s || s.at <= lastAt) return;
      try {
        value = parse(s.v);
        lastAt = s.at;
        notify();
      } catch {
        /* ignore a value we can't read; ours is still saved */
      }
    });
  }

  const store: Store<T> = {
    get: () => value,
    set(update) {
      value = typeof update === 'function' ? (update as (p: T) => T)(value) : update;
      if (status === 'loading') changedWhileLoading = true;
      if (status === 'ready') {
        lastAt = Math.max(Date.now(), lastAt + 1);
        save({ at: lastAt, v: value });
      }
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    loaded,
    status: () => status,
  };
  registry.push({ key, store: store as Store<unknown> });
  return store;
}

/** Wait for every store created so far to load. Render only after this. */
export function loadAllStores(): Promise<void> {
  return Promise.all(registry.map((r) => r.store.loaded)).then(() => {});
}

export interface StorageHealth {
  backends: Record<Backend['name'], BackendHealth>;
  /** Stores whose saved data couldn't be read; they aren't saving. */
  unknown: string[];
}

export function storageHealth(): StorageHealth {
  return {
    backends: structuredClone(health),
    unknown: registry.filter((r) => r.store.status() === 'unknown').map((r) => r.key),
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
