import { Link } from 'react-router';
import { ProgressBar } from '../components/ProgressBar';
import { COURSE_START, LEVELS, TOTAL_DAYS } from '../config';
import { courseDayOn, dateKeyForDay, formatLongEs, localDateKey } from '../lib/date';
import './home.css';

export function Home() {
  const today = localDateKey();
  const day = courseDayOn(today);
  const before = day < 1;
  const after = day > TOTAL_DAYS;

  return (
    <main>
      <header className="topbar">
        <span className="wordmark">100 Días</span>
        <span className="muted home-date">{formatLongEs(today)}</span>
      </header>

      <section className="hero-day" aria-live="polite">
        {before ? (
          <>
            <p className="eyebrow">Empezamos pronto</p>
            <p className="hero-num num">{1 - day}</p>
            <h1 className="hero-title">{1 - day === 1 ? 'día para empezar' : 'días para empezar'}</h1>
            <p className="muted">
              Día 1 es el {formatLongEs(COURSE_START)}. Mientras tanto, prueba el micrófono y el audio.
            </p>
          </>
        ) : after ? (
          <>
            <p className="eyebrow">Curso completado</p>
            <h1 className="hero-title">¡Enhorabuena!</h1>
            <p className="muted">All 100 days have unlocked. Keep reviewing to hold on to what you learned.</p>
          </>
        ) : (
          <>
            <p className="eyebrow">Hoy</p>
            <p className="hero-num num">Día {day}</p>
            <p className="muted">of {TOTAL_DAYS} · lessons arrive in the next build step</p>
          </>
        )}
      </section>

      <Link to="/mic-test" className="tile tile--block">
        Prueba de micrófono
      </Link>
      <p className="muted home-hint">Check speech recognition, recording and both voices on this device.</p>

      <section className="section" aria-labelledby="levels-h">
        <h2 id="levels-h">Niveles</h2>
        <p className="lede">Five levels, {TOTAL_DAYS} days, ending {formatLongEs(dateKeyForDay(TOTAL_DAYS))}.</p>
        <ol className="levels">
          {LEVELS.map((l) => (
            <li key={l.level} className="level">
              <span className="level-num num" aria-hidden="true">{l.level}</span>
              <div className="level-body">
                <div className="level-head">
                  <span className="level-name">{l.nameEs}</span>
                  <span className="muted num level-days">
                    Días {l.firstDay}–{l.lastDay}
                  </span>
                </div>
                <span className="muted level-en">{l.name}</span>
                <ProgressBar value={0} label={`Nivel ${l.level} progress`} />
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
