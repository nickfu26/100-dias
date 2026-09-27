/**
 * Ask the browser to keep IndexedDB/cache data from eviction. Called on every launch until
 * granted: browsers decide silently (Chrome by engagement, Safari when installed to Home Screen).
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageStatus(): Promise<{ persisted: boolean | null; usageMB?: number; quotaMB?: number }> {
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => null) : null;
  const est = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => undefined) : undefined;
  return {
    persisted,
    usageMB: est?.usage !== undefined ? est.usage / 1e6 : undefined,
    quotaMB: est?.quota !== undefined ? est.quota / 1e6 : undefined,
  };
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
