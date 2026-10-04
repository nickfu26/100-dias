import { useSyncExternalStore } from 'react';
import { debug } from '../lib/debugLog';

// Everything that uses the iOS audio session (a clip, a system voice, a recogniser that hasn't
// sent 'end' yet) holds an activity. 🎤 only starts once nothing has held one for SETTLE_MS.
// Module-level on purpose: lesson exercises remount between items, so per-component
// "still closing" state was lost and the next 🎤 could start while the previous recogniser
// was still shutting down. The mic test only worked because it never remounts.

export const SETTLE_MS = 300;

let active = 0;
let quiet = true;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === quiet) return;
  quiet = next;
  listeners.forEach((l) => l());
}

/** Mark the audio session busy; call the returned function (idempotent) when done. */
export function beginActivity(what: string): () => void {
  active++;
  clearTimeout(settleTimer);
  set(false);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    active--;
    if (active > 0) return;
    settleTimer = setTimeout(() => {
      if (active === 0) {
        debug(`audio session quiet ${SETTLE_MS}ms (after ${what}) → 🎤 ready`);
        set(true);
      }
    }, SETTLE_MS);
  };
}

/** Promise-shaped activity: busy until `p` settles. */
export function trackActivity<T>(what: string, p: Promise<T>): Promise<T> {
  const end = beginActivity(what);
  return p.finally(end);
}

export const micQuiet = () => quiet;

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** True when no audio is playing, no recogniser is open, and that has held for SETTLE_MS. */
export function useMicQuiet(): boolean {
  return useSyncExternalStore(subscribe, micQuiet, micQuiet);
}

type SessionType = 'playback' | 'play-and-record';

/**
 * iOS (Safari 16.4+) audio session. 'play-and-record' routes playback to the earpiece, so it
 * is only set right before the mic starts; every clip and system voice switches back to
 * 'playback' (loudspeaker, ignores the silent switch). Listening must always be audible.
 */
function setAudioSession(type: SessionType) {
  const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!s || typeof s.type !== 'string' || s.type === type) return;
  const was = s.type;
  try {
    s.type = type;
    debug(`audioSession: ${was} → ${s.type}`);
  } catch (e) {
    debug(`audioSession: set ${type} failed ${(e as Error).message}`);
  }
}

/** Before any clip, system voice or playback of a recording. */
export const enterPlaybackSession = () => setAudioSession('playback');
/** Right before recognition or recording starts, never earlier. */
export const enterRecordSession = () => setAudioSession('play-and-record');

export function audioSessionType(): string {
  return (navigator as Navigator & { audioSession?: { type: string } }).audioSession?.type ?? 'n/a';
}
