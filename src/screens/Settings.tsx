import { useState } from 'react';
import { Link } from 'react-router';
import { resetPreviewProgress, useProgress } from '../progress/store';
import { setPreview, useSettings } from '../lib/settings';
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

      <section className="section" aria-labelledby="device-h">
        <h2 id="device-h">Dispositivo</h2>
        <p className="lede">Check the microphone, speech recognition and both voices on this phone.</p>
        <Link to="/mic-test" className="tile tile--light tile--block">
          Prueba de micrófono
        </Link>
      </section>

      <p className="build num settings-build">Build {__APP_VERSION__}</p>
    </main>
  );
}
