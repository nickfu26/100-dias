import { debug } from '../lib/debugLog';
import type { Voice } from './manifest';

const FEMALE = /elvira|m[oó]nica|helena|laura|luc[ií]a|paulina|marisol|conchita|sara|ximena|elena/i;
const MALE = /[aá]lvaro|jorge|pablo|diego|enrique|juan|carlos|ra[uú]l|dar[ií]o/i;

export function ttsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function spanishVoices(): SpeechSynthesisVoice[] {
  if (!ttsAvailable()) return [];
  return speechSynthesis.getVoices().filter((v) => /^es[-_]ES/i.test(v.lang));
}

/** Chrome populates voices asynchronously. */
export function whenVoicesReady(): Promise<SpeechSynthesisVoice[]> {
  if (!ttsAvailable()) return Promise.resolve([]);
  const now = spanishVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(spanishVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

function pickVoice(voice: Voice): SpeechSynthesisVoice | undefined {
  const all = spanishVoices();
  const pattern = voice === 'f' ? FEMALE : MALE;
  return all.find((v) => pattern.test(v.name)) ?? all[0];
}

/** Cancel only when something is queued: iOS can drop the next utterance after a needless cancel(). */
export function cancelSpeech() {
  if (ttsAvailable() && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
}

/**
 * Call synchronously inside a user gesture (iOS). Always settles: iOS sometimes never
 * fires onstart/onend, so a watchdog resolves/rejects instead of hanging the UI.
 */
export function speak(text: string, voice: Voice, slow: boolean): Promise<void> {
  if (!ttsAvailable()) return Promise.reject(new Error('speechSynthesis unavailable'));
  cancelSpeech();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  const v = pickVoice(voice);
  if (v) u.voice = v;
  u.rate = slow ? 0.7 : 0.95;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(startDog);
      clearTimeout(endDog);
      fn();
    };
    // ~80 ms per character at normal speed, generous margin.
    const maxMs = 3000 + text.length * (slow ? 160 : 110);
    const startDog = setTimeout(
      () => settle(() => { debug('tts: never started (watchdog)'); cancelSpeech(); reject(new Error('tts-start-timeout')); }),
      2500,
    );
    const endDog = setTimeout(
      () => settle(() => { debug('tts: never ended (watchdog)'); cancelSpeech(); resolve(); }),
      maxMs,
    );
    u.onstart = () => { clearTimeout(startDog); debug(`tts: start (${v?.name ?? 'default voice'})`); };
    u.onend = () => settle(() => { debug('tts: end'); resolve(); });
    u.onerror = (e) =>
      settle(() => {
        debug(`tts: error ${e.error}`);
        if (e.error === 'interrupted' || e.error === 'canceled') resolve();
        else reject(new Error(`tts-${e.error}`));
      });
    speechSynthesis.speak(u);
  });
}
