import { stopAudio } from '../audio/player';
import { SPEECH_LANG } from '../config';
import { debug } from '../lib/debugLog';
import { releaseMic } from './recorder';

// Minimal typings: lib.dom's coverage of Web Speech varies by TS version.
interface RecAlternative { transcript: string; confidence: number }
interface RecResult { isFinal: boolean; length: number; [i: number]: RecAlternative }
interface RecEvent extends Event { resultIndex: number; results: { length: number; [i: number]: RecResult } }
interface RecErrorEvent extends Event { error: string; message?: string }
interface Recognizer extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognizerCtor = new () => Recognizer;

export function recognitionCtor(): { ctor: RecognizerCtor; name: string } | null {
  const w = window as unknown as Record<string, RecognizerCtor | undefined>;
  if (w.SpeechRecognition) return { ctor: w.SpeechRecognition, name: 'SpeechRecognition' };
  if (w.webkitSpeechRecognition) return { ctor: w.webkitSpeechRecognition, name: 'webkitSpeechRecognition' };
  return null;
}

export function recognitionAvailable(): boolean {
  return recognitionCtor() !== null;
}

export interface Alternative { text: string; confidence: number }

export interface RecognitionOutcome {
  alternatives: Alternative[]; // best first; empty if nothing recognised
  error?: string; // 'no-speech' | 'not-allowed' | 'service-not-allowed' | 'network' | 'watchdog' | ...
}

export interface RecognitionSession {
  result: Promise<RecognitionOutcome>;
  stop: () => void; // finish and deliver what was heard
  abort: () => void;
}

const LOGGED_EVENTS = ['start', 'audiostart', 'soundstart', 'speechstart', 'speechend', 'soundend', 'audioend', 'nomatch', 'end'];
const START_TIMEOUT_MS = 4000;
const WATCHDOG_MS = 8000;
const END_GRACE_MS = 1200;

/**
 * One utterance of es-ES recognition. Start it from a tap handler.
 * Recognition checks intelligibility only — it cannot judge individual phonemes.
 * The result promise ALWAYS settles: iOS sometimes never fires onend/onresult.
 */
export function recognizeOnce(opts: { onInterim?: (text: string) => void; onStart?: () => void } = {}): RecognitionSession {
  const found = recognitionCtor();
  if (!found) {
    return { result: Promise.resolve({ alternatives: [], error: 'unsupported' }), stop() {}, abort() {} };
  }

  // iOS: recognition can hang if the mic is held by getUserMedia or audio is playing.
  stopAudio();
  releaseMic();

  const rec = new found.ctor();
  rec.lang = SPEECH_LANG;
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 5;

  let finals: Alternative[] = [];
  let lastInterim = '';
  let error: string | undefined;
  let forced: string | undefined; // set when our watchdog aborts, so 'aborted' isn't reported
  let finish!: (reason?: string) => void;
  const t0 = performance.now();
  const ms = () => `+${Math.round(performance.now() - t0)}ms`;

  const result = new Promise<RecognitionOutcome>((resolve) => {
    let done = false;
    finish = (reason) => {
      if (done) return;
      done = true;
      clearTimeout(startDog);
      clearTimeout(watchdog);
      clearTimeout(graceDog);
      // Safari sometimes ends without a final result; use the last interim text.
      if (!finals.length && lastInterim) finals = [{ text: lastInterim, confidence: 0 }];
      const alternatives = finals.filter((a) => a.text).sort((a, b) => b.confidence - a.confidence);
      resolve({ alternatives, error: alternatives.length ? undefined : (reason ?? forced ?? error ?? 'no-speech') });
    };
  });

  let graceDog: ReturnType<typeof setTimeout> | undefined;
  const abortThenFinish = (reason: string) => {
    forced ??= reason;
    debug(`rec: ${reason} ${ms()} → abort()`);
    try {
      rec.abort();
    } catch { /* ignore */ }
    graceDog = setTimeout(() => {
      debug(`rec: no 'end' after abort ${ms()} → reset`);
      finish(reason);
    }, END_GRACE_MS);
  };
  const startDog = setTimeout(() => abortThenFinish('start-timeout'), START_TIMEOUT_MS);
  const watchdog = setTimeout(() => abortThenFinish('watchdog'), WATCHDOG_MS);

  for (const ev of LOGGED_EVENTS) rec.addEventListener(ev, () => debug(`rec: ${ev} ${ms()}`));
  rec.addEventListener('start', () => {
    clearTimeout(startDog);
    opts.onStart?.();
  });
  rec.addEventListener('result', (e) => {
    const r = e as RecEvent;
    let interim = '';
    for (let i = r.resultIndex; i < r.results.length; i++) {
      const res = r.results[i]!;
      if (res.isFinal) {
        const alts: Alternative[] = [];
        for (let k = 0; k < res.length; k++) alts.push({ text: res[k]!.transcript.trim(), confidence: res[k]!.confidence });
        finals = alts;
        debug(`rec: result final "${alts[0]?.text}" (${alts.length} alt) ${ms()}`);
      } else {
        interim += res[0]!.transcript;
      }
    }
    if (interim) {
      lastInterim = interim.trim();
      debug(`rec: result interim "${lastInterim}" ${ms()}`);
      opts.onInterim?.(lastInterim);
    }
  });
  rec.addEventListener('error', (e) => {
    const er = e as RecErrorEvent;
    error = er.error;
    debug(`rec: error ${er.error}${er.message ? ` (${er.message})` : ''} ${ms()}`);
  });
  rec.addEventListener('end', () => finish());

  try {
    rec.start();
    debug('rec: start() called');
  } catch (e) {
    debug(`rec: start() threw ${(e as Error).name}: ${(e as Error).message}`);
    finish('start-failed');
  }

  return {
    result,
    stop: () => {
      debug(`rec: stop() ${ms()}`);
      try {
        rec.stop();
      } catch { /* ignore */ }
      // If 'end' never arrives after stop, don't leave the UI waiting.
      graceDog = setTimeout(() => finish(), END_GRACE_MS * 2);
    },
    abort: () => abortThenFinish('aborted'),
  };
}

export const RECOGNITION_ERROR_HELP: Record<string, string> = {
  unsupported: 'This browser has no speech recognition. Shadowing (record & compare) will be used instead.',
  'not-allowed': 'Microphone or speech permission was denied. Check Settings → Safari → Microphone / Speech Recognition.',
  'service-not-allowed': 'Speech recognition service is blocked. On iPhone, enable Siri & Dictation; some home-screen apps cannot use it.',
  'no-speech': 'No speech was detected. Tap and speak right away, close to the mic.',
  'audio-capture': 'No microphone was found or it is in use by another app.',
  network: 'Recognition needs a network connection on this device.',
  aborted: 'Recognition was cancelled.',
  'language-not-supported': 'es-ES recognition is not supported on this device.',
  watchdog: 'Recognition stopped responding after 8 s and was reset. The event log shows the last step it reached.',
  'start-timeout': 'Recognition never started (no “start” event within 4 s) and was reset.',
  'start-failed': 'Recognition could not start. See the event log.',
};
