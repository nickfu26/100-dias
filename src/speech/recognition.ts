import { audioSessionType, beginActivity } from '../audio/activity';
import { stopAudio } from '../audio/player';
import { SPEECH_LANG } from '../config';
import { debug } from '../lib/debugLog';
import { scoringText } from '../lib/text';
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
  // Settles when the recogniser has really shut down ('end'), or CLOSE_FALLBACK_MS after the
  // result if 'end' never comes. Don't start another session before this (iOS can hang).
  closed: Promise<void>;
  stop: () => void; // finish and deliver what was heard
  abort: () => void;
}

const LOGGED_EVENTS = ['start', 'audiostart', 'soundstart', 'speechstart', 'speechend', 'soundend', 'audioend', 'nomatch', 'end'];
const START_TIMEOUT_MS = 4000;
const WATCHDOG_MS = 8000;
const END_GRACE_MS = 1200;
// End of speech: iOS often never delivers a final result, so stop once the interim
// transcript has been stable this long (or already says the target).
const SILENCE_MS = 1200;
// No 'end' this long after the result: abort() the recogniser, then wait up to
// ABORT_CLOSE_MS more for 'end' before treating it as closed.
const CLOSE_FALLBACK_MS = 1000;
const ABORT_CLOSE_MS = 1500;
// speechstart but no transcript this long: iOS has stalled; stop and let the learner retry
// instead of waiting for the 8 s watchdog.
const SPEECH_NO_RESULT_MS = 3000;

// The recogniser that hasn't sent 'end' yet, whichever screen started it. A new session aborts
// it first: two live recognisers on iOS give the second one silence until the watchdog fires.
let live: { abort: () => void } | null = null;

/**
 * One utterance of es-ES recognition. Start it from a tap handler.
 * Recognition checks intelligibility only — it cannot judge individual phonemes.
 * The result promise ALWAYS settles: iOS sometimes never fires onend/onresult.
 * `onListening` fires on 'audiostart' — only then is the mic actually capturing (the first
 * start() can take ~3 s on iOS). With `target`, a matching interim ends the utterance at once.
 */
export function recognizeOnce(
  opts: { onInterim?: (text: string) => void; onListening?: () => void; target?: string } = {},
): RecognitionSession {
  const found = recognitionCtor();
  if (!found) {
    return { result: Promise.resolve({ alternatives: [], error: 'unsupported' }), closed: Promise.resolve(), stop() {}, abort() {} };
  }

  // Normally the 🎤 button is disabled until the last session closed (useMicQuiet); this is the backstop.
  if (live) {
    debug('rec: previous recogniser still open → abort() it first');
    live.abort();
  }
  // iOS: recognition can hang if the mic is held by getUserMedia or audio is playing.
  stopAudio();
  releaseMic();

  // A fresh instance every attempt; instances are never reused.
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

  let isClosed = false;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => (resolveClosed = resolve));
  const endActivity = beginActivity('recognition');
  const self = { abort: () => { try { rec.abort(); } catch { /* ignore */ } } };
  live = self;
  const markClosed = () => {
    if (isClosed) return;
    isClosed = true;
    if (live === self) live = null;
    endActivity();
    resolveClosed();
  };

  const result = new Promise<RecognitionOutcome>((resolve) => {
    let done = false;
    finish = (reason) => {
      if (done) return;
      done = true;
      setTimeout(() => {
        if (isClosed) return;
        debug(`rec: no 'end' ${CLOSE_FALLBACK_MS}ms after result ${ms()} → abort()`);
        self.abort();
        setTimeout(() => {
          if (isClosed) return;
          debug(`rec: still no 'end' ${ms()} → treat as closed`);
          markClosed();
        }, ABORT_CLOSE_MS);
      }, CLOSE_FALLBACK_MS);
      clearTimeout(startDog);
      clearTimeout(watchdog);
      clearTimeout(graceDog);
      clearTimeout(silenceDog);
      clearTimeout(speechDog);
      // Safari sometimes ends without a final result; use the last interim text.
      if (!finals.length && lastInterim) finals = [{ text: lastInterim, confidence: 0 }];
      const alternatives = finals.filter((a) => a.text).sort((a, b) => b.confidence - a.confidence);
      resolve({ alternatives, error: alternatives.length ? undefined : (reason ?? forced ?? error ?? 'no-speech') });
    };
  });

  let graceDog: ReturnType<typeof setTimeout> | undefined;
  let silenceDog: ReturnType<typeof setTimeout> | undefined;
  let speechDog: ReturnType<typeof setTimeout> | undefined;
  const targetKey = opts.target ? scoringText(opts.target) : '';
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
  rec.addEventListener('start', () => clearTimeout(startDog));
  rec.addEventListener('audiostart', () => opts.onListening?.());
  rec.addEventListener('speechstart', () => {
    clearTimeout(speechDog);
    speechDog = setTimeout(() => {
      if (!lastInterim && !finals.length) endOfSpeech(`speechstart but no result in ${SPEECH_NO_RESULT_MS}ms`);
    }, SPEECH_NO_RESULT_MS);
  });
  rec.addEventListener('result', (e) => {
    clearTimeout(speechDog);
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
    if (interim && interim.trim() !== lastInterim) {
      lastInterim = interim.trim();
      debug(`rec: result interim "${lastInterim}" ${ms()}`);
      opts.onInterim?.(lastInterim);
      clearTimeout(silenceDog);
      if (targetKey && scoringText(lastInterim) === targetKey) endOfSpeech('interim matches target');
      else silenceDog = setTimeout(() => endOfSpeech(`interim stable ${SILENCE_MS}ms`), SILENCE_MS);
    }
  });
  rec.addEventListener('error', (e) => {
    const er = e as RecErrorEvent;
    error = er.error;
    debug(`rec: error ${er.error}${er.message ? ` (${er.message})` : ''} ${ms()}`);
  });
  rec.addEventListener('end', () => {
    finish();
    markClosed();
  });

  // Stop listening and score what we have; don't wait for a final result that may never come.
  function endOfSpeech(why: string) {
    debug(`rec: end of speech (${why}) ${ms()} → stop()`);
    try {
      rec.stop();
    } catch { /* ignore */ }
    finish();
  }

  try {
    rec.start();
    debug(`rec: start() called · fresh instance · lang ${rec.lang} · audioSession ${audioSessionType()}${opts.target ? ` · target "${opts.target}"` : ''}`);
  } catch (e) {
    debug(`rec: start() threw ${(e as Error).name}: ${(e as Error).message}`);
    finish('start-failed');
  }

  return {
    result,
    closed,
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
  watchdog: `Recognition stopped responding after ${WATCHDOG_MS / 1000} s and was reset. The event log shows the last step it reached.`,
  'start-timeout': 'Recognition never started (no “start” event within 4 s) and was reset.',
  'start-failed': 'Recognition could not start. See the event log.',
};
