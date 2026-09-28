import { useEffect } from 'react';
import { Link } from 'react-router';
import { ProgressBar } from '../components/ProgressBar';
import { PreviewBanner } from '../components/PreviewBanner';
import { COURSE_START, LEVELS, TOTAL_DAYS, levelForDay } from '../config';
import { AVAILABLE_DAYS, dayTitle } from '../content/loader';
import { courseDayOn, dateKeyForDay, formatLongEs, localDateKey } from '../lib/date';
import { useSettings } from '../lib/settings';
import { streakOf, useProgress } from '../progress/store';
import { isDayUnlocked } from '../progress/unlock';
import { backfillCards } from '../srs/backfill';
import { dueIds, useCards } from '../srs/cards';
import './home.css';

function formatShortEs(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function Home() {
  const today = localDateKey();
  const todayDay = courseDayOn(today);
  const { preview } = useSettings();
  const progress = useProgress();
  const streak = streakOf(progress.activeDates, today);
  const cards = useCards();
  const due = dueIds(cards, today).length;
  useEffect(() => {
    void backfillCards();
  }, [preview]);

  const unlocked = AVAILABLE_DAYS.filter((d) => isDayUnlocked(d, preview, today));
  const pending = unlocked.filter((d) => !progress.completed[d]);
  const pendingCount = pending.length;
  const focus = pending[0]; // oldest unfinished first (catch-up)
  const allCaughtUp = unlocked.length > 0 && focus === undefined;
  const before = todayDay < 1 && !preview;
  const after = todayDay > TOTAL_DAYS;

  const shownLevel = levelForDay(focus ?? Math.max(1, Math.min(todayDay, TOTAL_DAYS))) ?? LEVELS[0]!;
  const levelDays = Array.from({ length: shownLevel.lastDay - shownLevel.firstDay + 1 }, (_, i) => shownLevel.firstDay + i);

  return (
    <main>
      <header className="topbar">
        <span className="wordmark">100 Días</span>
        <div className="topbar-right">
          <span className="muted home-date">{formatLongEs(today)}</span>
          <Link to="/settings" className="icon-btn" aria-label="Ajustes (settings)">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path
                d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm7.4-2.2.1-1-.1-1 2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6-.1 1 .1 1-2 1.6 2 3.4 2.4-1c.5.4 1.1.8 1.7 1l.4 2.5h4l.4-2.5c.6-.2 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </header>

      {preview && <PreviewBanner />}

      <section className="hero-day" aria-live="polite">
        {before ? (
          <>
            <p className="eyebrow">Empezamos pronto</p>
            <p className="hero-num num">{1 - todayDay}</p>
            <h1 className="hero-title">{1 - todayDay === 1 ? 'día para empezar' : 'días para empezar'}</h1>
            <p className="muted">
              Día 1 es el {formatLongEs(COURSE_START)}. To try the lessons now, turn on{' '}
              <Link to="/settings">Vista previa</Link> in Ajustes.
            </p>
          </>
        ) : focus !== undefined ? (
          <>
            <p className="eyebrow">
              {preview ? 'Vista previa' : focus < todayDay ? 'Pendiente' : 'Hoy'} · Día {focus}
            </p>
            <h1 className="hero-title hero-title--lesson" lang="es-ES">
              {dayTitle(focus)?.es}
            </h1>
            <p className="muted hero-en">{dayTitle(focus)?.en}</p>
            <Link to={`/day/${focus}`} className="tile tile--block tile--terra hero-go">
              {progress.inProgress[focus] ? 'Continuar' : 'Empezar'}
            </Link>
            {due > 0 && (
              <p className="muted home-hint">
                Includes a review of <span className="num">{Math.min(due, 20)}</span> {due === 1 ? 'word' : 'words'} from earlier days.
              </p>
            )}
            {!preview && focus < todayDay && (
              <p className="muted home-hint">
                {pendingCount} days to catch up, oldest first. One or two a day is plenty.
              </p>
            )}
          </>
        ) : allCaughtUp ? (
          <>
            <p className="eyebrow">Hoy</p>
            <h1 className="hero-title">{after ? '¡Enhorabuena!' : '¡Todo hecho!'}</h1>
            <p className="muted">
              {after
                ? 'All 100 days are done. Keep reviewing to hold on to what you learned.'
                : `You're up to date. Día ${Math.min(todayDay + 1, TOTAL_DAYS)} unlocks tomorrow.`}
            </p>
            {due > 0 && (
              <Link to="/review" className="tile tile--block hero-go review-go">
                Repasar · <span className="num">{due}</span> {due === 1 ? 'palabra' : 'palabras'}
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="eyebrow">Hoy · Día {todayDay}</p>
            <h1 className="hero-title">Coming soon</h1>
            <p className="muted">This day's lesson hasn't been written yet.</p>
          </>
        )}
      </section>

      {!preview && (streak.days > 0 || !before) && (
        <p className={`streak${streak.activeToday ? ' streak--today' : ''}`}>
          <span className="streak-num num">{streak.days}</span>
          <span>
            {streak.days === 1 ? 'día seguido' : 'días seguidos'}
            <span className="muted">
              {' '}
              · {streak.activeToday ? 'done for today' : streak.days > 0 ? 'finish a lesson today to keep it' : 'your streak'}
            </span>
          </span>
        </p>
      )}

      <section className="section" aria-labelledby="days-h">
        <h2 id="days-h">
          Nivel {shownLevel.level} · {shownLevel.nameEs}
        </h2>
        <p className="lede">{shownLevel.name}</p>
        <ol className="days">
          {levelDays.map((d) => {
            const open = AVAILABLE_DAYS.includes(d) && isDayUnlocked(d, preview, today);
            const done = !!progress.completed[d];
            const started = !done && !!progress.inProgress[d];
            const title = dayTitle(d);
            const body = (
              <>
                <span className={`day-num num${done ? ' day-num--done' : ''}`} aria-hidden="true">
                  {done ? '✓' : d}
                </span>
                <span className="day-body">
                  <span className="day-title" lang="es-ES">
                    {title?.es ?? `Día ${d}`}
                  </span>
                  <span className="muted day-sub">
                    Día {d} ·{' '}
                    {done ? 'hecho' : started ? 'a medias' : open ? (title?.en ?? '') : `se abre el ${formatShortEs(dateKeyForDay(d))}`}
                  </span>
                </span>
              </>
            );
            return (
              <li key={d}>
                {open ? (
                  <Link to={`/day/${d}`} className={`day${d === focus ? ' day--focus' : ''}`} aria-label={`Día ${d}: ${title?.es ?? ''}`}>
                    {body}
                  </Link>
                ) : (
                  <div className="day day--locked" aria-disabled="true">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="section" aria-labelledby="levels-h">
        <h2 id="levels-h">Niveles</h2>
        <p className="lede">Five levels, {TOTAL_DAYS} days, ending {formatLongEs(dateKeyForDay(TOTAL_DAYS))}.</p>
        <ol className="levels">
          {LEVELS.map((l) => {
            const n = l.lastDay - l.firstDay + 1;
            const done = Object.keys(progress.completed).filter((k) => +k >= l.firstDay && +k <= l.lastDay).length;
            return (
              <li key={l.level} className="level">
                <span className="level-num num" aria-hidden="true">
                  {l.level}
                </span>
                <div className="level-body">
                  <div className="level-head">
                    <span className="level-name">{l.nameEs}</span>
                    <span className="muted num level-days">
                      Días {l.firstDay}–{l.lastDay}
                    </span>
                  </div>
                  <span className="muted level-en">{l.name}</span>
                  <ProgressBar value={done / n} label={`Nivel ${l.level}: ${done} of ${n} days`} />
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
