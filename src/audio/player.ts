import { resolveAudio, type Speed, type Voice } from './manifest';
import { speak, ttsAvailable } from './ttsFallback';

export type PlaySource = 'file' | 'tts';

// One shared element: once it has played inside a user gesture, iOS lets it play again.
let el: HTMLAudioElement | null = null;
function audioEl(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
  }
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
  if (ttsAvailable()) speechSynthesis.cancel();
}

/** Start `src` on the shared element; resolves on end (or when superseded), rejects on error. */
function playSrc(src: string, rate: number): { started: Promise<void>; ended: Promise<void> } {
  stopAudio();
  const gen = generation;
  const a = audioEl();
  a.src = src;
  a.playbackRate = rate;
  a.preservesPitch = true;

  let onEnd!: () => void;
  let onErr!: (e: unknown) => void;
  const ended = new Promise<void>((resolve, reject) => {
    onEnd = resolve;
    onErr = reject;
  });
  const handleEnded = () => gen === generation && finish(onEnd);
  const handleError = () => gen === generation && finish(() => onErr(new Error('media error')));
  function finish(fn: () => void) {
    a.removeEventListener('ended', handleEnded);
    a.removeEventListener('error', handleError);
    if (settleCurrent === superseded) settleCurrent = null;
    fn();
  }
  const superseded = () => finish(onEnd);
  settleCurrent = superseded;
  a.addEventListener('ended', handleEnded);
  a.addEventListener('error', handleError);

  const started = a.play().catch((err: unknown) => {
    if (gen === generation) finish(() => onErr(err));
    throw err;
  });
  started.catch(() => {}); // callers observe errors via `ended`
  return { started, ended };
}

export interface PlayOptions {
  voice: Voice;
  speed?: Speed;
}

/**
 * Play pre-generated audio for `text`, falling back to speechSynthesis (es-ES).
 * Must be called synchronously from a tap handler: nothing is awaited before play().
 * Resolves (with the source used) when playback ends.
 */
export function playSpanish(text: string, { voice, speed = 'normal' }: PlayOptions): Promise<PlaySource> {
  const slow = speed === 'slow';
  const resolved = resolveAudio(text, voice, speed);
  if (!resolved) {
    stopAudio();
    return speak(text, voice, slow).then(() => 'tts' as const);
  }
  const { ended } = playSrc(resolved.url, resolved.rateFallback ? 0.75 : 1);
  return ended.then(
    () => 'file' as const,
    (err: unknown) => {
      // Not in a gesture: TTS would fail the same way.
      if (err instanceof DOMException && err.name === 'NotAllowedError') throw err;
      // Missing file / offline & uncached → system voice.
      return speak(text, voice, slow).then(() => 'tts' as const);
    },
  );
}

/** Play a blob URL (e.g. the learner's own recording) through the same element. */
export function playUrl(url: string): Promise<void> {
  return playSrc(url, 1).ended;
}
