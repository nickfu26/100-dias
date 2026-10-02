import { useEffect, useRef, useState } from 'react';
import { ListenButtons } from '../components/AudioButtons';
import type { Repeat as R } from '../content/types';
import { bestScore, type SpeechScore } from '../speech/fuzzy';
import { recognitionAvailable, recognizeOnce, RECOGNITION_ERROR_HELP, type RecognitionSession } from '../speech/recognition';
import { Shadow } from './Shadow';
import { SpeechError, useSpeaking } from './speaking';
import type { ExerciseProps } from './types';

const MAX_TRIES = 3;
// Recognition errors (heard nothing, hung, reset) before this exercise switches to record & compare.
const MAX_FAILURES = 2;
// Errors that mean recognition can't work on this device: switch to shadowing.
const FATAL = ['unsupported', 'not-allowed', 'service-not-allowed', 'language-not-supported', 'start-failed'];

export function Repeat(props: ExerciseProps<R>) {
  const { ex, voice, answered, onAnswer } = props;
  const speaking = useSpeaking();
  const [fallback, setFallback] = useState<string | null>(recognitionAvailable() ? null : 'Speech recognition isn’t available here, so this one is record & compare.');
  const [state, setState] = useState<'idle' | 'starting' | 'listening'>('idle');
  const [interim, setInterim] = useState('');
  const [score, setScore] = useState<SpeechScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [failures, setFailures] = useState(0);
  const session = useRef<RecognitionSession | null>(null);
  const [closing, setClosing] = useState(false); // old session still shutting down
  const min = ex.minScore ?? 0.7;

  useEffect(() => () => session.current?.abort(), []);

  if (speaking.recordOnly) return <Shadow {...props} ex={{ es: ex.es, en: ex.en }} fallbackReason={speaking.reason} />;
  if (fallback) return <Shadow {...props} ex={{ es: ex.es, en: ex.en }} fallbackReason={fallback} />;

  function toggle() {
    if (session.current) return session.current.stop();
    setScore(null);
    setError(null);
    setInterim('');
    setState('starting');
    const s = recognizeOnce({ onListening: () => setState('listening'), onInterim: setInterim, target: ex.es });
    session.current = s;
    setClosing(true);
    s.closed.then(() => setClosing(false));
    s.result.then((o) => {
      session.current = null;
      setState('idle');
      if (o.error && FATAL.includes(o.error)) {
        speaking.recordRestOfSession();
        setFallback(`${RECOGNITION_ERROR_HELP[o.error] ?? 'Speech recognition failed.'} Using record & compare instead.`);
        return;
      }
      if (o.error) {
        // Didn't hear anything: doesn't use up a try.
        const n = failures + 1;
        setFailures(n);
        if (n >= MAX_FAILURES) setFallback('Recognition didn’t catch that twice, so this one is record & compare.');
        else setError('Didn’t catch that. Tap 🎤 to try again.');
        return;
      }
      const sc = bestScore(ex.es, o.alternatives.map((a) => a.text));
      setScore(sc);
      const n = tries + 1;
      setTries(n);
      if (sc && sc.score >= min) {
        onAnswer({ correct: true, message: n > 1 ? `Got it on try ${n}.` : undefined });
      }
    });
  }

  const listening = state !== 'idle';
  const passed = !!score && score.score >= min;
  const outOfTries = !passed && tries >= MAX_TRIES;

  return (
    <div className="ex">
      <p className="say-target" lang="es-ES">
        {ex.es}
      </p>
      <p className="ex-en center">{ex.en}</p>
      <ListenButtons text={ex.es} voice={voice} disabled={listening} />

      <div className="center-col">
        <button
          className={`mic-btn${state === 'listening' ? ' mic-btn--on' : state === 'starting' ? ' mic-btn--ready' : ''}`}
          onClick={toggle}
          disabled={answered || outOfTries || (!listening && closing)}
          aria-label={listening ? 'Stop listening' : 'Say it'}
        >
          <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        <p className="mic-status muted" aria-live="polite">
          {state === 'starting'
            ? 'Getting ready…'
            : state === 'listening'
              ? interim || 'Escuchando… habla ahora'
              : answered
                ? ''
                : score && !passed
                  ? outOfTries
                    ? 'Recognition didn’t catch it. That happens; move on.'
                    : 'Almost. Listen again and have another go.'
                  : '🎤 Tap and say the phrase'}
        </p>
      </div>

      {score && (
        <p className="words" lang="es-ES">
          {score.words.map((w, i) => (
            <span key={i} className={`word word--${w.status}`}>
              {w.word}
              {w.status === 'close' && w.heard && <small>oí: {w.heard}</small>}
            </span>
          ))}
        </p>
      )}
      {error && <SpeechError>{error}</SpeechError>}
      {failures > 0 && !answered && (
        <p className="speak-offer">
          <button className="link-btn" onClick={speaking.recordRestOfSession}>
            Use record &amp; compare for the rest of this lesson
          </button>
        </p>
      )}
      {outOfTries && !answered && (
        <button className="tile tile--block" onClick={() => onAnswer({ correct: null, note: 'needs-work', message: 'Not graded. Speech recognition is fussy.' })}>
          Seguir
        </button>
      )}
      {!answered && !outOfTries && (
        <p className="center">
          <button className="link-btn" onClick={() => onAnswer({ correct: null, note: 'skipped' })}>
            Can't speak now: skip
          </button>
        </p>
      )}
    </div>
  );
}
