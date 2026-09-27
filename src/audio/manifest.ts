import { audioKey } from '../content/audioStrings';

export type Voice = 'f' | 'm';
export type Speed = 'normal' | 'slow';

interface Manifest {
  generated: string;
  slowPolicy: string;
  entries: Record<string, { id: string; slow: boolean }>;
}

let manifest: Manifest | null = null;
let loading: Promise<Manifest | null> | null = null;

const BASE = import.meta.env.BASE_URL;

/** Load once at startup so lookups are synchronous inside tap handlers (required by iOS). */
export function loadManifest(): Promise<Manifest | null> {
  loading ??= fetch(`${BASE}audio/manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .then((m) => (manifest = m))
    .catch(() => null);
  return loading;
}

export function manifestInfo() {
  return manifest ? { count: Object.keys(manifest.entries).length, generated: manifest.generated } : null;
}

export interface ResolvedAudio {
  url: string;
  /** true when slow was requested but only a normal file exists → play it at a reduced rate */
  rateFallback: boolean;
}

/** Exact-text lookup (accents preserved). Returns null if there is no pre-generated file. */
export function resolveAudio(text: string, voice: Voice, speed: Speed): ResolvedAudio | null {
  const entry = manifest?.entries[audioKey(text)];
  if (!entry) return null;
  const wantSlow = speed === 'slow';
  const slowFile = wantSlow && entry.slow;
  return {
    url: `${BASE}audio/${entry.id}-${voice}${slowFile ? '-slow' : ''}.mp3`,
    rateFallback: wantSlow && !entry.slow,
  };
}
