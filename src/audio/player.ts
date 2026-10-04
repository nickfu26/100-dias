import { debug } from '../lib/debugLog';
import { enterPlaybackSession, trackActivity } from './activity';
import { resolveAudio, type Speed, type Voice } from './manifest';
import { cancelSpeech, speak } from './ttsFallback';

export type PlaySource = 'file' | 'tts';

// ---------- In-memory blobs ----------
// Playing from blob: URLs keeps the service worker (and iOS's Range-request handling)
// out of media playback entirely. Blobs are fetched ahead of time with plain GETs, so
// nothing is awaited inside the tap handler.
const blobUrls = new Map<string, string>(); // absolute file URL → blob: URL
const inflight = new Map<string, Promise<void>>();
const MAX_BLOBS = 400;

function remember(url: string, blobUrl: string) {
  blobUrls.set(url, blobUrl);
  while (blobUrls.size > MAX_BLOBS) {
    const [oldest, old] = blobUrls.entries().next().value as [string, string];
    URL.revokeObjectURL(old);
    blobUrls.delete(oldest);
  }
}

function fetchBlob(url: string): Promise<void> {
  if (blobUrls.has(url)) return Promise.resolve();
  let p = inflight.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => remember(url, URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }))))
      .catch((e: Error) => debug(`preload failed ${url.split('/').pop()}: ${e.message}`))
      .finally(() => inflight.delete(url));
    inflight.set(url, p);
  }
  return p;
}

/** Preload audio for these texts into memory (and, via the SW, into the offline cache). */
export async function preloadAudio(
  texts: string[],
  voices: Voice[] = ['f', 'm'],
  speeds: Speed[] = ['normal', 'slow'],
): Promise<number> {
  const urls = new Set<string>();
  for (const t of texts)
    for (const v of voices)
      for (const s of speeds) {
        const r = resolveAudio(t, v, s);
        if (r) urls.add(abs(r.url));
      }
  const todo = [...urls].filter((u) => !blobUrls.has(u));
  // Small batches: iOS dislikes dozens of parallel requests.
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(fetchBlob));
  return todo.length;
}

const abs = (u: string) => new URL(u, location.href).href;

// ---------- The shared element ----------
// Created synchronously on the first tap. Once it has played inside a gesture,
// iOS lets the same element play again later.
let el: HTMLAudioElement | null = null;
let label = '';

function audioEl(): HTMLAudioElement {
  if (el) return el;
  el = new Audio();
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  const log = (ev: string) => () => debug(`media ${ev} · ${label}`);
  for (const ev of ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'waiting', 'stalled', 'ended']) {
    el.addEventListener(ev, log(ev));
  }
  el.addEventListener('error', () => debug(`media error code=${el?.error?.code} ${el?.error?.message ?? ''} · ${label}`));
  return el;
}

// Each play gets a generation; events from a superseded play are ignored.
let generation = 0;
let settleCurrent: (() => void) | null = null;

export function stopAudio() {
  generation++;
  settleCurrent?.();
  settleCurrent = null;
  el?.pause();
  cancelSpeech();
}

export function isAudioPlaying(): boolean {
  return settleCurrent !== null;
}

const START_TIMEOUT_MS = 5000;

/** Start `src` on the shared element. The promise ALWAYS settles (watchdogs). */
function playSrc(src: string, rate: number, what: string): Promise<void> {
  stopAudio();
  enterPlaybackSession(); // after 🎤 the session is play-and-record, which plays from the earpiece
  const gen = generation;
  const a = audioEl();
  label = what;

  return new Promise<void>((resolve, reject) => {
    let done = false;
    let endDog: ReturnType<typeof setTimeout> | undefined;
    const startDog = setTimeout(() => {
      debug(`media never started within ${START_TIMEOUT_MS / 1000} s · ${what}`);
      fail(new Error('play-timeout'));
    }, START_TIMEOUT_MS);

    const onPlaying = () => {
      if (gen !== generation) return;
      clearTimeout(startDog);
      const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 20;
      clearTimeout(endDog);
      endDog = setTimeout(() => {
        debug(`media end watchdog · ${what}`);
        finish(resolve);
      }, (dur * 1000) / rate + 2500);
    };
    const onEnded = () => gen === generation && finish(resolve);
    const onError = () => gen === generation && fail(new Error(`media-error ${a.error?.code ?? ''}`));

    function finish(fn: () => void) {
      if (done) return;
      done = true;
      clearTimeout(startDog);
      clearTimeout(endDog);
      a.removeEventListener('playing', onPlaying);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('error', onError);
      if (settleCurrent === supersede) settleCurrent = null;
      fn();
    }
    function fail(err: Error) {
      if (gen === generation) a.pause();
      finish(() => reject(err));
    }
    const supersede = () => finish(resolve);
    settleCurrent = supersede;

    a.addEventListener('playing', onPlaying);
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);

    a.src = src;
    a.defaultPlaybackRate = rate; // iOS resets playbackRate on load; default survives
    a.playbackRate = rate;
    a.preservesPitch = true;
    // play() is called synchronously in the same tick as the tap.
    debug(`play() called · ${what}`);
    const p = a.play();
    p.then(
      () => debug(`play() resolved · ${what}`),
      (err: DOMException) => {
        debug(`play() rejected ${err.name}: ${err.message} · ${what}`);
        if (gen === generation) fail(err);
      },
    );
  });
}

export interface PlayOptions {
  voice: Voice;
  speed?: Speed;
}

/**
 * Play pre-generated audio for `text`, falling back to speechSynthesis (es-ES).
 * Call synchronously from a tap handler: nothing is awaited before play().
 * Always settles, with the source that was used.
 */
export function playSpanish(text: string, opts: PlayOptions): Promise<PlaySource> {
  return trackActivity(`"${text}"`, playSpanishInner(text, opts));
}

function playSpanishInner(text: string, { voice, speed = 'normal' }: PlayOptions): Promise<PlaySource> {
  const slow = speed === 'slow';
  const resolved = resolveAudio(text, voice, speed);
  if (!resolved) {
    stopAudio();
    debug(`no MP3 for "${text}" → system voice`);
    return speak(text, voice, slow).then(() => 'tts' as const);
  }
  const url = abs(resolved.url);
  const blob = blobUrls.get(url);
  const what = `"${text}" ${voice}${slow ? ' slow' : ''} ${blob ? 'blob' : 'net'}`;
  if (!blob) void fetchBlob(url); // ready for next time

  return playSrc(blob ?? url, resolved.rateFallback ? 0.75 : 1, what).then(
    () => 'file' as const,
    (err: unknown) => {
      // Not in a gesture: TTS would fail the same way.
      if (err instanceof DOMException && err.name === 'NotAllowedError') throw err;
      debug(`→ falling back to system voice`);
      return speak(text, voice, slow).then(() => 'tts' as const);
    },
  );
}

/** Play a blob URL (e.g. the learner's own recording) through the same element. */
export function playUrl(url: string, what = 'recording'): Promise<void> {
  return trackActivity(what, playSrc(url, 1, what));
}
