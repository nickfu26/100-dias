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

/** Call synchronously inside a user gesture (iOS). */
export function speak(text: string, voice: Voice, slow: boolean): Promise<void> {
  if (!ttsAvailable()) return Promise.reject(new Error('speechSynthesis unavailable'));
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  const v = pickVoice(voice);
  if (v) u.voice = v;
  u.rate = slow ? 0.7 : 0.95;
  return new Promise((resolve, reject) => {
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(e.error)));
    speechSynthesis.speak(u);
  });
}
