// Shadowing: record the learner, then play it back next to the native audio.
import { debug } from '../lib/debugLog';

const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac', 'audio/ogg;codecs=opus'];

export function recorderAvailable(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

export interface Recording {
  url: string;
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

export interface RecorderSession {
  stop: () => void;
  result: Promise<Recording>;
}

// The one live mic stream, so it can be released before speech recognition starts
// (webkitSpeechRecognition can hang on iOS while getUserMedia holds the mic).
let activeStream: MediaStream | null = null;
let activeRecorder: MediaRecorder | null = null;

/** Stop any recording and release the microphone. Safe to call anytime. */
export function releaseMic() {
  if (activeRecorder?.state === 'recording') {
    debug('mic: stopping recorder before recognition');
    activeRecorder.stop();
  }
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    debug('mic: tracks stopped');
  }
  activeStream = null;
  activeRecorder = null;
}

/** Start recording (call from a tap). Auto-stops after maxMs. */
export async function startRecording(maxMs = 10_000): Promise<RecorderSession> {
  releaseMic();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  activeStream = stream;
  const mimeType = pickMimeType();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  activeRecorder = rec;
  const chunks: Blob[] = [];
  const t0 = performance.now();

  const result = new Promise<Recording>((resolve, reject) => {
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onerror = () => {
      releaseMic();
      reject(new Error('recording failed'));
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (activeStream === stream) activeStream = null;
      if (activeRecorder === rec) activeRecorder = null;
      const type = rec.mimeType || mimeType || 'audio/mp4';
      const blob = new Blob(chunks, { type });
      resolve({ url: URL.createObjectURL(blob), blob, durationMs: performance.now() - t0, mimeType: type });
    };
  });
  rec.start();
  const timer = setTimeout(() => rec.state === 'recording' && rec.stop(), maxMs);
  return {
    stop: () => {
      clearTimeout(timer);
      if (rec.state === 'recording') rec.stop();
    },
    result,
  };
}
