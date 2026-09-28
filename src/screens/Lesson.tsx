import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { loadDay } from '../content/loader';
import type { DayLesson } from '../content/types';
import { useSettings } from '../lib/settings';
import { isDayUnlocked } from '../progress/unlock';

export function Lesson() {
  const day = Number(useParams().day);
  const { preview } = useSettings();
  const [lesson, setLesson] = useState<DayLesson | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadDay(day).then((l) => alive && setLesson(l));
    return () => {
      alive = false;
    };
  }, [day]);

  return (
    <main>
      <header className="topbar">
        <Link to="/" className="back" aria-label="Back to home">
          ← <span className="wordmark">100 Días</span>
        </Link>
      </header>
      {!isDayUnlocked(day, preview) ? (
        <p className="muted">Día {day} is still locked.</p>
      ) : lesson === undefined ? (
        <p className="muted">Cargando…</p>
      ) : lesson === null ? (
        <p className="muted">There is no lesson for Día {day} yet.</p>
      ) : (
        <>
          <p className="eyebrow">Día {lesson.day}</p>
          <h1 className="page-title">{lesson.title.es}</h1>
          <p className="muted">{lesson.title.en}</p>
          <p className="muted" style={{ marginTop: 24 }}>
            The lesson player arrives in the next deploy.
          </p>
        </>
      )}
    </main>
  );
}
