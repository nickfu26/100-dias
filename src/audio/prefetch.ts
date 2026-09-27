import { resolveAudio, type Voice } from './manifest';

const CACHE = 'audio'; // must match workbox runtimeCaching cacheName in vite.config.ts

/**
 * Store full (non-range) MP3 responses so the service worker can serve them offline,
 * including the Range requests Safari makes for <audio>.
 */
export async function prefetchAudio(texts: string[], voices: Voice[] = ['f', 'm']): Promise<number> {
  if (!('caches' in window)) return 0;
  const urls = new Set<string>();
  for (const t of texts) {
    for (const v of voices) {
      for (const speed of ['normal', 'slow'] as const) {
        const r = resolveAudio(t, v, speed);
        if (r) urls.add(new URL(r.url, location.href).href);
      }
    }
  }
  const cache = await caches.open(CACHE);
  let added = 0;
  await Promise.all(
    [...urls].map(async (url) => {
      if (await cache.match(url, { ignoreVary: true })) return;
      try {
        const res = await fetch(url);
        if (res.status === 200) {
          await cache.put(url, res);
          added++;
        }
      } catch {
        /* offline — try again next time */
      }
    }),
  );
  return added;
}
