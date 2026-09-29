import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import appAudio from '../../content/app-audio.json';
import { VOICES } from '../config';
import { loadManifest, manifestInfo, type Speed, type Voice } from '../audio/manifest';
import { playSpanish, playUrl, preloadAudio, stopAudio } from '../audio/player';
import { spanishVoices, speak, whenVoicesReady } from '../audio/ttsFallback';
import { onDebug } from '../lib/debugLog';
import { isStandalone, storageStatus } from '../lib/storage';
import { bestScore, type SpeechScore } from '../speech/fuzzy';
import {
  recognitionCtor,
  recognizeOnce,
  RECOGNITION_ERROR_HELP,
  type RecognitionOutcome,
  type RecognitionSession,
} from '../speech/recognition';
import { pickMimeType, recorderAvailable, releaseMic, startRecording, type Recording, type RecorderSession } from '../speech/recorder';
import { MIC_ERROR_HELP } from '../speech/micErrors';
import './micTest.css';

const PHRASES = appAudio.phrases;

const PASS = 0.7;

type Check = { label: string; state: 'yes' | 'no' | 'info'; detail: string };

function useDiagnostics(tick: number): Check[] {
  const [checks, setChecks] = useState<Check[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadManifest();
      const [voices, storage] = await Promise.all([whenVoicesReady(), storageStatus()]);
      const rec = recognitionCtor();
      const mime = pickMimeType();
      const man = manifestInfo();
      const hasGum = typeof navigator.mediaDevices?.getUserMedia === 'function';
      const sw = navigator.serviceWorker?.controller ? 'active' : 'serviceWorker' in navigator ? 'installing — reload once' : 'unsupported';
      const list: Check[] = [
        { label: 'Secure context (HTTPS)', state: window.isSecureContext ? 'yes' : 'no', detail: window.isSecureContext ? 'Yes' : 'Mic and recognition need HTTPS' },
        { label: 'Speech recognition', state: rec ? 'yes' : 'no', detail: rec ? `${rec.name} · es-ES` : 'Not available → exercises use shadowing' },
        { label: 'Microphone API', state: hasGum ? 'yes' : 'no', detail: hasGum ? 'getUserMedia available' : 'Unavailable' },
        { label: 'Recording (shadowing)', state: recorderAvailable() ? 'yes' : 'no', detail: recorderAvailable() ? `MediaRecorder · ${mime ?? 'default type'}` : 'MediaRecorder unavailable' },
        { label: 'Audio files', state: man ? 'yes' : 'no', detail: man ? `${man.count} phrases · generated ${man.generated.slice(0, 10)}` : 'manifest.json not loaded' },
        { label: 'System voices (es-ES)', state: voices.length ? 'yes' : 'info', detail: voices.length ? voices.map((v) => v.name).join(', ') : 'None — fallback TTS unavailable' },
        { label: 'Offline (service worker)', state: sw === 'active' ? 'yes' : 'info', detail: sw },
        {
          label: 'Persistent storage',
          state: storage.persisted ? 'yes' : 'info',
          detail:
            (storage.persisted === null ? 'API unavailable' : storage.persisted ? 'Granted' : 'Not granted (install to Home Screen)') +
            (storage.usageMB !== undefined ? ` · ${storage.usageMB.toFixed(1)} MB used` : ''),
        },
        { label: 'Installed app', state: 'info', detail: isStandalone() ? 'Running from Home Screen' : 'Running in browser tab' },
      ];
      if (alive) setChecks(list);
    })();
    return () => {
      alive = false;
    };
  }, [tick]);
  return checks;
}

export function MicTest() {
  const [tick, setTick] = useState(0);
  const checks = useDiagnostics(tick);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [playing, setPlaying] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [target, setTarget] = useState(0);
  const phrase = PHRASES[target]!;

  const addLog = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString('es-ES', { hour12: false });
    setLog((l) => [`${t}  ${msg}`, ...l].slice(0, 200));
  }, []);

  // Low-level audio/speech events (media events, recognition events, watchdogs) → log.
  useEffect(() => onDebug(addLog), [addLog]);

  useEffect(() => {
    loadManifest().then(async (m) => {
      if (!m) return addLog('✗ audio manifest failed to load');
      const t0 = performance.now();
      const n = await preloadAudio(PHRASES.map((p) => p.es));
      addLog(`preloaded ${n} clips into memory in ${Math.round(performance.now() - t0)} ms`);
    });
    return () => {
      stopAudio();
      releaseMic();
    };
  }, [addLog]);

  // ---------- Listening ----------
  function play(text: string, voice: Voice, key: string) {
    addLog(`tap ▶ "${text}" ${VOICES[voice].name} ${speed}`);
    setPlaying(key);
    playSpanish(text, { voice, speed })
      .then((src) => addLog(`▶ "${text}" · ${VOICES[voice].name} · ${speed} · ${src === 'file' ? 'MP3' : 'system voice (fallback)'}`))
      .catch((e: Error) => addLog(`✗ play "${text}": ${e.name ?? ''} ${e.message}`))
      .finally(() => setPlaying((p) => (p === key ? null : p)));
  }
  function playSystem(text: string, key: string) {
    stopAudio();
    addLog(`tap ▶ "${text}" system voice`);
    setPlaying(key);
    speak(text, 'f', speed === 'slow')
      .then(() => addLog(`▶ "${text}" · system voice ${spanishVoices()[0]?.name ?? '(none)'}`))
      .catch((e: Error) => addLog(`✗ system voice: ${e.message}`))
      .finally(() => setPlaying((p) => (p === key ? null : p)));
  }

  // ---------- Recognition ----------
  const [recState, setRecState] = useState<'idle' | 'starting' | 'listening'>('idle');
  const [interim, setInterim] = useState('');
  const [outcome, setOutcome] = useState<RecognitionOutcome | null>(null);
  const [score, setScore] = useState<SpeechScore | null>(null);
  const session = useRef<RecognitionSession | null>(null);
  const [closing, setClosing] = useState(false); // old session still shutting down

  function toggleRecognition() {
    if (session.current) {
      session.current.stop();
      return;
    }
    addLog('tap 🎤');
    setPlaying(null);
    setOutcome(null);
    setScore(null);
    setInterim('');
    setRecState('starting');
    const s = recognizeOnce({
      onListening: () => setRecState('listening'),
      onInterim: setInterim,
      target: phrase.es,
    });
    session.current = s;
    setClosing(true);
    s.closed.then(() => setClosing(false));
    s.result.then((o) => {
      session.current = null;
      setRecState('idle');
      setOutcome(o);
      const sc = bestScore(phrase.es, o.alternatives.map((a) => a.text));
      setScore(sc);
      if (o.error) addLog(`🎤 error: ${o.error}`);
      else addLog(`🎤 heard "${o.alternatives[0]?.text}" → ${Math.round((sc?.score ?? 0) * 100)}% (${o.alternatives.length} alt)`);
    });
  }
  useEffect(() => () => session.current?.abort(), []);

  // ---------- Recording ----------
  const [recording, setRecording] = useState<Recording | null>(null);
  const [recorder, setRecorder] = useState<RecorderSession | null>(null);
  const [recStarting, setRecStarting] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recorder) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [recorder]);

  function toggleRecording() {
    if (recorder) {
      recorder.stop();
      return;
    }
    stopAudio();
    // First statement after stopAudio: getUserMedia runs synchronously inside the tap (iOS).
    const pending = startRecording(10_000);
    addLog('tap ● record → getUserMedia called');
    setRecStarting(true);
    setMicError(null);
    if (recording) URL.revokeObjectURL(recording.url);
    setRecording(null);
    pending
      .then((r) => {
        setRecStarting(false);
        setRecorder(r);
        addLog('● recording…');
        return r.result;
      })
      .then((result) => {
        setRecording(result);
        addLog(`■ recorded ${(result.durationMs / 1000).toFixed(1)} s · ${result.mimeType} · ${(result.blob.size / 1024).toFixed(0)} KB · mic released`);
      })
      .catch((e: Error) => {
        addLog(`✗ recording: ${e.name} ${e.message}`);
        setMicError(MIC_ERROR_HELP[e.name] ?? `Recording failed (${e.name}). See the log.`);
      })
      .finally(() => {
        setRecStarting(false);
        setRecorder(null);
      });
  }
  function playMine() {
    if (!recording) return;
    setPlaying('mine');
    playUrl(recording.url, 'my recording')
      .catch((e: Error) => addLog(`✗ playback: ${e.message}`))
      .finally(() => setPlaying(null));
  }
  function compare(voice: Voice) {
    if (!recording) return;
    setPlaying('compare');
    playSpanish(phrase.es, { voice, speed: 'normal' })
      .then(() => new Promise((r) => setTimeout(r, 350)))
      .then(() => playUrl(recording.url, 'my recording'))
      .then(() => addLog('⇄ compared native → mine'))
      .catch((e: Error) => addLog(`✗ compare: ${e.name} ${e.message}`))
      .finally(() => setPlaying(null));
  }

  // ---------- Report ----------
  const [copied, setCopied] = useState(false);
  function copyReport() {
    const text = [
      `100 Días — mic test report · build ${__APP_VERSION__}`,
      navigator.userAgent,
      ...checks.map((c) => `${c.state === 'yes' ? '✓' : c.state === 'no' ? '✗' : '·'} ${c.label}: ${c.detail}`),
      '',
      ...log,
    ].join('\n');
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => addLog('✗ clipboard unavailable'),
    );
  }

  const listening = recState !== 'idle';
  const recordingBusy = recStarting || recorder !== null;
  const audioBusy = playing !== null;
  // The mic is exclusive: recognition, recording and playback never overlap.
  const micDisabled = !recognitionCtor() || (!listening && (closing || recordingBusy || audioBusy));
  const recordDisabled = !recorderAvailable() || (!recorder && (listening || audioBusy || recStarting));
  const playDisabled = listening || recordingBusy;
  const passed = score && score.score >= PASS;

  return (
    <main className="mic">
      <header className="topbar">
        <Link to="/" className="back" aria-label="Back to home">
          ← <span className="wordmark">100 Días</span>
        </Link>
      </header>

      <p className="eyebrow">Prueba de micrófono</p>
      <h1 className="mic-title">Does this phone hear you?</h1>
      <p className="muted">Run each section, then tap “Copy report” and paste it back to me.</p>
      <p className="build num">Build {__APP_VERSION__}</p>

      {/* 1. Device */}
      <section className="section" aria-labelledby="dev-h">
        <h2 id="dev-h">Tu dispositivo</h2>
        <ul className="checks">
          {checks.map((c) => (
            <li key={c.label} className={`check check--${c.state}`}>
              <span className="check-mark" aria-hidden="true">
                {c.state === 'yes' ? '✓' : c.state === 'no' ? '✕' : '·'}
              </span>
              <span className="check-label">{c.label}</span>
              <span className="check-detail muted">{c.detail}</span>
            </li>
          ))}
        </ul>
        <button className="tile tile--light tile--small" onClick={() => setTick((t) => t + 1)}>
          Re-check
        </button>
      </section>

      {/* 2. Listening */}
      <section className="section" aria-labelledby="listen-h">
        <h2 id="listen-h">Escuchar</h2>
        <p className="lede">Both voices, pre-generated. “Sistema” is the offline fallback voice.</p>
        <div className="segmented" role="group" aria-label="Speed">
          {(['normal', 'slow'] as const).map((s) => (
            <button key={s} className="tile tile--light tile--small" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
              {s === 'normal' ? 'Normal' : 'Lento −30%'}
            </button>
          ))}
        </div>
        <ul className="phrases">
          {PHRASES.map((p, i) => (
            <li key={p.es} className="phrase">
              <div>
                <p className="es" lang="es-ES">{p.es}</p>
                <p className="muted phrase-en">{p.en}</p>
                {p.note && <p className="phrase-note">{p.note}</p>}
              </div>
              <div className="phrase-actions">
                {(['f', 'm'] as const).map((v) => (
                  <button
                    key={v}
                    className="tile tile--small"
                    data-playing={playing === `${i}${v}` || undefined}
                    disabled={playDisabled} onClick={() => play(p.es, v, `${i}${v}`)}
                  >
                    ▶ {VOICES[v].name}
                  </button>
                ))}
                <button className="tile tile--light tile--small" disabled={playDisabled} onClick={() => playSystem(p.es, `${i}s`)}>
                  Sistema
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. Recognition */}
      <section className="section" aria-labelledby="rec-h">
        <h2 id="rec-h">Repite</h2>
        <p className="lede">
          Speech recognition (es-ES) checks that your words are understood. It can’t judge individual sounds like θ
          or rr; that’s what the recording test below is for.
        </p>
        <div className="chips" role="radiogroup" aria-label="Phrase to say">
          {PHRASES.map((p, i) => (
            <button
              key={p.es}
              role="radio"
              aria-checked={i === target}
              className="chip"
              onClick={() => {
                setTarget(i);
                setScore(null);
                setOutcome(null);
              }}
            >
              {p.es}
            </button>
          ))}
        </div>

        <div className="say">
          <p className="say-target" lang="es-ES">{phrase.es}</p>
          <p className="muted">{phrase.en}</p>
          <div className="say-row">
            <button className="tile tile--light tile--small" disabled={playDisabled} onClick={() => play(phrase.es, 'f', 'say-f')}>
              ▶ Elvira
            </button>
            <button className="tile tile--light tile--small" disabled={playDisabled} onClick={() => play(phrase.es, 'm', 'say-m')}>
              ▶ Álvaro
            </button>
          </div>

          <button
            className={`mic-btn${recState === 'listening' ? ' mic-btn--on' : recState === 'starting' ? ' mic-btn--ready' : ''}`}
            onClick={toggleRecognition}
            aria-label={listening ? 'Stop listening' : 'Start speaking'}
            disabled={micDisabled}
          >
            <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </button>
          <p className="mic-status muted" aria-live="polite">
            {!recognitionCtor()
              ? 'Speech recognition unavailable here'
              : recordingBusy && !listening
                ? 'Recording in progress: stop it first'
                : audioBusy && !listening
                  ? 'Waiting for audio to finish…'
                  : recState === 'starting'
                ? 'Getting ready…'
                : recState === 'listening'
                  ? interim || 'Escuchando… habla ahora'
                  : 'Tap the tile and say the phrase'}
          </p>

          {score && outcome && !outcome.error && (
            <div className="result">
              <span className={`verdict ${passed ? 'verdict--ok stamp' : 'verdict--bad shake'}`}>
                {passed ? '¡Bien!' : 'Otra vez'} <span className="num">{Math.round(score.score * 100)}%</span>
              </span>
              <p className="words" lang="es-ES">
                {score.words.map((w, i) => (
                  <span key={i} className={`word word--${w.status}`}>
                    {w.word}
                    {w.status === 'close' && w.heard && <small>oí: {w.heard}</small>}
                  </span>
                ))}
              </p>
              {score.extra.length > 0 && <p className="muted">Extra words heard: {score.extra.join(', ')}</p>}
              <details className="alts">
                <summary>Recogniser alternatives ({outcome.alternatives.length})</summary>
                <ol>
                  {outcome.alternatives.map((a, i) => (
                    <li key={i}>
                      “{a.text}” <span className="muted num">{a.confidence ? a.confidence.toFixed(2) : 'n/a'}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          )}
          {outcome?.error && (
            <p className="error" role="alert">
              <strong>{outcome.error}</strong> — {RECOGNITION_ERROR_HELP[outcome.error] ?? 'Unexpected error.'}
            </p>
          )}
        </div>
      </section>

      {/* 4. Recording */}
      <section className="section" aria-labelledby="shadow-h">
        <h2 id="shadow-h">Graba y compara</h2>
        <p className="lede">Shadowing: record “{phrase.es}”, then hear the native voice followed by yours.</p>
        <button
          className={`tile tile--block ${recorder ? 'tile--terra' : ''}`}
          onClick={toggleRecording}
          disabled={recordDisabled}
        >
          {recStarting ? (
            'Allow the microphone…'
          ) : recorder ? (
            <>
              ■ Parar <span className="num">{elapsed.toFixed(1)} s</span>
            </>
          ) : recording ? (
            '● Grabar otra vez'
          ) : (
            '● Grabar'
          )}
        </button>
        {micError && (
          <p className="error" role="alert">
            {micError}
          </p>
        )}
        {recording && (
          <div className="shadow-row">
            <button className="tile tile--light tile--small" disabled={playDisabled} onClick={playMine}>
              ▶ Mi voz
            </button>
            <button className="tile tile--light tile--small" disabled={playDisabled} onClick={() => compare('f')}>
              ⇄ Elvira → yo
            </button>
            <button className="tile tile--light tile--small" disabled={playDisabled} onClick={() => compare('m')}>
              ⇄ Álvaro → yo
            </button>
          </div>
        )}
      </section>

      {/* 5. Report */}
      <section className="section" aria-labelledby="log-h">
        <h2 id="log-h">Registro</h2>
        <button className="tile tile--block tile--light" onClick={copyReport}>
          {copied ? 'Copiado ✓' : 'Copy report'}
        </button>
        <pre className="log" aria-live="polite">{log.length ? log.join('\n') : 'Events will appear here.'}</pre>
      </section>
    </main>
  );
}
