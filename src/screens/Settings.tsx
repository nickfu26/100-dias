import { useRef, useState } from 'react';
import { backupMeta, exportBackup, makeBackup, parseBackup, restoreBackup, summarize, type Backup } from '../lib/backup';
import { formatLongEs, localDateKey } from '../lib/date';
import { useStore } from '../lib/persisted';
import { Link } from 'react-router';
import { resetPreviewProgress, useProgress } from '../progress/store';
import { copySpeechLog } from '../lib/debugLog';
import { setPreview, setSpeakingMode, useSettings, type SpeakingMode } from '../lib/settings';
import './settings.css';

export function Settings() {
  const { preview } = useSettings();
  const progress = useProgress();
  const [cleared, setCleared] = useState(false);
  const previewDone = preview ? Object.keys(progress.completed).length : 0;

  return (
    <main>
      <header className="topbar">
        <Link to="/" className="back" aria-label="Back to home">
          ← <span className="wordmark">100 Días</span>
        </Link>
      </header>

      <h1 className="page-title">Ajustes</h1>

      <section className="section" aria-labelledby="preview-h">
        <div className="setting">
          <div>
            <h2 id="preview-h" className="setting-name">Vista previa</h2>
            <p className="muted setting-en">Preview mode</p>
          </div>
          <button
            role="switch"
            aria-checked={preview}
            aria-labelledby="preview-h"
            className="switch"
            onClick={() => {
              setPreview(!preview);
              setCleared(false);
            }}
          >
            <span className="switch-knob" />
          </button>
        </div>
        <p className="setting-help">
          Unlocks every day and the Level 1 test so you can try lessons before their date. Everything you do in preview is
          saved separately: it never marks real days complete or counts towards your streak. Turn it off to go back to
          your real progress.
        </p>
        {preview && (
          <div className="setting-extra">
            <p className="muted">
              Preview progress: <span className="num">{previewDone}</span> {previewDone === 1 ? 'day' : 'days'} done
            </p>
            <button
              className="tile tile--light tile--small"
              onClick={() => {
                resetPreviewProgress();
                setCleared(true);
              }}
            >
              {cleared ? 'Borrado ✓' : 'Reset preview progress'}
            </button>
          </div>
        )}
      </section>

      <SpeakingSection />

      <BackupSection />

      <section className="section" aria-labelledby="device-h">
        <h2 id="device-h">Dispositivo</h2>
        <p className="lede">Check the microphone, speech recognition and both voices on this phone.</p>
        <Link to="/mic-test" className="tile tile--light tile--block">
          Prueba de micrófono
        </Link>
        <SpeechLogButton />
      </section>

      <p className="build num settings-build">Build {__APP_VERSION__}</p>
    </main>
  );
}

const MODES: { id: SpeakingMode; label: string }[] = [
  { id: 'record', label: 'Record & compare' },
  { id: 'recognition', label: 'Recognition (beta)' },
];

function SpeakingSection() {
  const { speakingMode } = useSettings();
  return (
    <section className="section" aria-labelledby="speak-h">
      <h2 id="speak-h" className="setting-name">Hablar</h2>
      <p className="muted setting-en">Speaking mode</p>
      <div className="segmented" role="group" aria-labelledby="speak-h">
        {MODES.map((m) => (
          <button
            key={m.id}
            aria-pressed={speakingMode === m.id}
            className="tile tile--light tile--small"
            onClick={() => setSpeakingMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="setting-help">
        {speakingMode === 'recognition'
          ? 'Beta: say each 🎤 phrase and speech recognition checks it. It is still unreliable on iPhone; if it fails in a lesson, you can switch to recording for the rest of that lesson.'
          : 'Record yourself, play it back next to the native voice, and rate it yourself. Works everywhere, offline too.'}
      </p>
    </section>
  );
}

/** For reports from real lessons: everything audio and recognition logged since the app opened. */
function SpeechLogButton() {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <button
      className="tile tile--light tile--block"
      onClick={() =>
        copySpeechLog().then((ok) => {
          setCopied(ok);
          setTimeout(() => setCopied(null), 2500);
        })
      }
    >
      {copied === null ? 'Copy last speech log' : copied ? 'Copiado ✓' : 'Clipboard unavailable'}
    </button>
  );
}

function BackupSection() {
  const meta = useStore(backupMeta);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Backup | null>(null);
  const [paste, setPaste] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const last = meta.lastExport ? localDateKey(new Date(meta.lastExport)) : null;

  async function doExport() {
    setError(null);
    const r = await exportBackup();
    setStatus(r === 'shared' ? 'Backup shared ✓' : r === 'downloaded' ? 'Backup downloaded ✓' : null);
  }
  async function copyText() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(makeBackup()));
      backupMeta.set((m) => ({ ...m, lastExport: new Date().toISOString() }));
      setStatus('Copied. Paste it into a note or an email to yourself ✓');
    } catch {
      setError('The clipboard isn’t available here. Use Exportar instead.');
    }
  }
  function load(text: string) {
    setStatus(null);
    try {
      setCandidate(parseBackup(text));
      setError(null);
    } catch (e) {
      setCandidate(null);
      setError((e as Error).message);
    }
  }
  function confirm() {
    if (!candidate) return;
    restoreBackup(candidate);
    setCandidate(null);
    setPaste('');
    setStatus('Progress restored ✓');
  }

  const sum = candidate ? summarize(candidate) : null;
  return (
    <section className="section" aria-labelledby="backup-h">
      <h2 id="backup-h">Copia de seguridad</h2>
      <p className="lede">
        Your progress lives only on this phone. Export a backup now and then (weekly is plenty) and keep it in Files or email it
        to yourself.
      </p>
      <p className={`backup-last${last ? '' : ' backup-last--never'}`}>
        {last ? <>Last backup: {formatLongEs(last)}</> : 'No backup yet'}
      </p>
      <div className="backup-actions">
        <button className="tile tile--block" onClick={doExport}>
          Exportar copia
        </button>
        <button className="tile tile--light tile--small" onClick={copyText}>
          Copy as text instead
        </button>
      </div>

      <h3 className="backup-h3">Restaurar</h3>
      <p className="muted small">Choose a backup file, or paste backup text. You'll see what's in it before anything changes.</p>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json,text/plain"
        className="visually-hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) f.text().then(load, () => setError('Couldn’t read that file.'));
          e.target.value = '';
        }}
      />
      <div className="backup-actions">
        <button className="tile tile--light tile--block" onClick={() => fileRef.current?.click()}>
          Elegir archivo…
        </button>
      </div>
      <details className="paste">
        <summary>Paste backup text</summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} spellCheck={false} placeholder='{"app":"100-dias",…}' />
        <button className="tile tile--light tile--small" disabled={!paste.trim()} onClick={() => load(paste)}>
          Check backup
        </button>
      </details>

      {sum && (
        <div className="restore" role="alertdialog" aria-labelledby="restore-h">
          <p id="restore-h" className="restore-h">
            Backup from {formatLongEs(localDateKey(new Date(sum.exportedAt)))}
          </p>
          <ul className="restore-list">
            <li>
              Days completed: <strong>{sum.daysCompleted.length ? sum.daysCompleted.join(', ') : 'none'}</strong>
            </li>
            <li>
              Words in review: <strong className="num">{sum.words}</strong>
            </li>
            <li>
              Last active: <strong>{sum.lastActive ? formatLongEs(sum.lastActive) : '—'}</strong>
            </li>
          </ul>
          <p className="muted small">This replaces all progress on this phone with the backup.</p>
          <div className="restore-actions">
            <button className="tile tile--light" onClick={() => setCandidate(null)}>
              Cancelar
            </button>
            <button className="tile tile--terra" onClick={confirm}>
              Reemplazar
            </button>
          </div>
        </div>
      )}
      {status && (
        <p className="backup-status" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
