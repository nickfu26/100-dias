import { useEffect, useRef, useState } from 'react';
import { ListenButtons } from '../components/AudioButtons';
import type { Voice } from '../audio/manifest';
import { playSpanish, playUrl, stopAudio } from '../audio/player';
import { MIC_ERROR_HELP } from '../speech/micErrors';
import { recorderAvailable, releaseMic, startRecording, type Recording, type RecorderSession } from '../speech/recorder';
import type { ExerciseProps } from './types';

interface ShadowLike {
  es: string;
  en: string;
  listenFor?: string;
}

/** Listen, record yourself, compare with the native voice, then rate yourself. */
export function Shadow({ ex, voice, answered, onAnswer, fallbackReason }: ExerciseProps<ShadowLike> & { fallbackReason?: string }) {
  const [recorder, setRecorder] = useState<RecorderSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const urlRef = useRef<string | null>(null);
  const canRecord = recorderAvailable();

  useEffect(
    () => () => {
      releaseMic();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  function toggleRecord() {
    if (recorder) return recorder.stop();
    stopAudio();
    const pending = startRecording(12_000); // getUserMedia inside the tap (iOS)
    setStarting(true);
    setError(null);
    pending
      .then((r) => {
        setStarting(false);
        setRecorder(r);
        return r.result;
      })
      .then((rec) => {
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = rec.url;
        setRecording(rec);
      })
      .catch((e: Error) => setError(MIC_ERROR_HELP[e.name] ?? `Recording failed (${e.name}).`))
      .finally(() => {
        setStarting(false);
        setRecorder(null);
      });
  }

  function compare(v: Voice) {
    if (!recording) return;
    setBusy(true);
    playSpanish(ex.es, { voice: v })
      .catch(() => undefined)
      .then(() => new Promise((r) => setTimeout(r, 300)))
      .then(() => playUrl(recording.url))
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }

  function mine() {
    if (!recording) return;
    setBusy(true);
    playUrl(recording.url)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }

  const recBusy = starting || recorder !== null;
  return (
    <div className="ex">
      <p className="say-target" lang="es-ES">
        {ex.es}
      </p>
      <p className="ex-en center">{ex.en}</p>
      {ex.listenFor && <p className="listen-for">👂 {ex.listenFor}</p>}
      {fallbackReason && <p className="muted small center">{fallbackReason}</p>}
      <ListenButtons text={ex.es} voice={voice} disabled={recBusy} />

      {canRecord ? (
        <>
          <button className={`tile tile--block ${recorder ? 'tile--terra' : ''}`} onClick={toggleRecord} disabled={answered || starting || busy}>
            {starting ? 'Allow the microphone…' : recorder ? '■ Parar' : recording ? '● Grabar otra vez' : '● Grabar'}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {recording && (
            <div className="voice-row">
              <button className="tile tile--light tile--small" onClick={mine} disabled={busy || recBusy}>
                ▶ Mi voz
              </button>
              <button className="tile tile--light tile--small" onClick={() => compare(voice)} disabled={busy || recBusy}>
                ⇄ Comparar
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="muted small center">Recording isn't available here. Say it aloud with the audio, then rate yourself.</p>
      )}

      {!answered && (recording || !canRecord) && (
        <div className="rate">
          <p className="rate-q">How close was it?</p>
          <div className="rate-row">
            <button className="tile tile--light" onClick={() => onAnswer({ correct: null, note: 'needs-work', message: 'Keep practising this one.' })}>
              Tengo que practicar
            </button>
            <button className="tile" onClick={() => onAnswer({ correct: null, note: 'close', message: 'Nice.' })}>
              ¡Sonaba bien!
            </button>
          </div>
        </div>
      )}
      {!answered && (
        <p className="center">
          <button className="link-btn" onClick={() => onAnswer({ correct: null, note: 'skipped' })}>
            Can't speak now: skip
          </button>
        </p>
      )}
    </div>
  );
}
