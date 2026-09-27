import { SPEECH_LANG } from '../config';

// Minimal typings: lib.dom's coverage of Web Speech varies by TS version.
interface RecAlternative { transcript: string; confidence: number }
interface RecResult { isFinal: boolean; length: number; [i: number]: RecAlternative }
interface RecEvent { resultIndex: number; results: { length: number; [i: number]: RecResult } }
interface RecErrorEvent { error: string; message?: string }
interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: RecErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechend: (() => void) | null;
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
  error?: string; // 'no-speech' | 'not-allowed' | 'service-not-allowed' | 'network' | 'audio-capture' | ...
}

export interface RecognitionSession {
  result: Promise<RecognitionOutcome>;
  stop: () => void; // finish and deliver what was heard
  abort: () => void;
}

/**
 * One utterance of es-ES recognition. Start it from a tap handler.
 * Recognition checks intelligibility only — it cannot judge individual phonemes.
 */
export function recognizeOnce(opts: {
  onInterim?: (text: string) => void;
  onStart?: () => void;
  timeoutMs?: number;
} = {}): RecognitionSession {
  const found = recognitionCtor();
  if (!found) {
    return { result: Promise.resolve({ alternatives: [], error: 'unsupported' }), stop() {}, abort() {} };
  }
  const rec = new found.ctor();
  rec.lang = SPEECH_LANG;
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 5;

  let finals: Alternative[] = [];
  let lastInterim = '';
  let error: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const result = new Promise<RecognitionOutcome>((resolve) => {
    rec.onstart = () => opts.onStart?.();
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) {
          const alts: Alternative[] = [];
          for (let k = 0; k < r.length; k++) alts.push({ text: r[k]!.transcript.trim(), confidence: r[k]!.confidence });
          finals = alts;
        } else {
          interim += r[0]!.transcript;
        }
      }
      if (interim) {
        lastInterim = interim.trim();
        opts.onInterim?.(lastInterim);
      }
    };
    rec.onerror = (e) => {
      error = e.error;
    };
    rec.onend = () => {
      clearTimeout(timer);
      // Safari sometimes ends without a final result; use the last interim text.
      if (!finals.length && lastInterim) finals = [{ text: lastInterim, confidence: 0 }];
      const alternatives = finals.filter((a) => a.text).sort((a, b) => b.confidence - a.confidence);
      resolve({ alternatives, error: alternatives.length ? undefined : (error ?? 'no-speech') });
    };
  });

  try {
    rec.start();
    timer = setTimeout(() => rec.stop(), opts.timeoutMs ?? 8000);
  } catch (e) {
    return { result: Promise.resolve({ alternatives: [], error: String((e as Error).message ?? e) }), stop() {}, abort() {} };
  }
  return { result, stop: () => rec.stop(), abort: () => rec.abort() };
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
};
