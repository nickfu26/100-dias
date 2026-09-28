import { useSyncExternalStore } from 'react';

/**
 * A tiny localStorage-backed store usable from React (useSyncExternalStore) and plain code.
 * Values are small JSON (settings, progress); every write is persisted immediately so a
 * killed tab or an iOS app swipe never loses more than the current step.
 */
export interface Store<T> {
  get(): T;
  set(update: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function persisted<T>(key: string, initial: T, parse: (raw: unknown) => T = (r) => r as T): Store<T> {
  let value = read();
  const listeners = new Set<() => void>();

  function read(): T {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : parse(JSON.parse(raw));
    } catch {
      return initial; // private mode, quota, or corrupt JSON: start clean rather than crash
    }
  }

  // Another tab (or the installed app and a browser tab) changed it.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== key) return;
      value = read();
      listeners.forEach((l) => l());
    });
  }

  return {
    get: () => value,
    set(update) {
      value = typeof update === 'function' ? (update as (p: T) => T)(value) : update;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage full or blocked: keep the in-memory value */
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
