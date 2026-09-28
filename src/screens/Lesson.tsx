import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { preloadAudio } from '../audio/player';
import { ProgressBar } from '../components/ProgressBar';
import { PreviewBanner } from '../components/PreviewBanner';
import { usePlay } from '../components/usePlay';
import { lessonStrings } from '../content/audioStrings';
import { loadDay } from '../content/loader';
import type { DayLesson, Exercise } from '../content/types';
import { ExerciseView, defaultPrompt } from '../exercises/ExerciseView';
import type { Answer } from '../exercises/types';
import { answer, newSnapshot, progressFraction, score, type LessonSnapshot } from '../lesson/session';
import { TeachCardView, VocabCard } from '../lesson/TeachCardView';
import { useSettings } from '../lib/settings';
import { isDayUnlocked } from '../progress/unlock';
import './lesson.css';

export function Lesson() {
  const day = Number(useParams().day);
  const { preview } = useSettings();
  const [lesson, setLesson] = useState<DayLesson | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setLesson(undefined);
    loadDay(day).then((l) => alive && setLesson(l));
    return () => {
      alive = false;
    };
  }, [day]);

  if (!isDayUnlocked(day, preview)) return <Message text={`Día ${day} is still locked.`} />;
  if (lesson === undefined) return <Message text="Cargando…" />;
  if (lesson === null) return <Message text={`There is no lesson for Día ${day} yet.`} />;
  return <LessonRun key={lesson.day} lesson={lesson} preview={preview} />;
}

function Message({ text }: { text: string }) {
  return (
    <main>
      <header className="topbar">
        <Link to="/" className="back" aria-label="Back to home">
          ← <span className="wordmark">100 Días</span>
        </Link>
      </header>
      <p className="muted">{text}</p>
    </main>
  );
}

function LessonRun({ lesson, preview }: { lesson: DayLesson; preview: boolean }) {
  const navigate = useNavigate();
  const [snap, setSnap] = useState<LessonSnapshot>(() => newSnapshot(lesson));
  const [pending, setPending] = useState<Answer | null>(null);
  const teachCount = lesson.teach.length + (lesson.vocab.length ? 1 : 0);
  const topRef = useRef<HTMLDivElement>(null);

  // Warm today's audio (both voices, normal speed) so taps play instantly and offline.
  useEffect(() => {
    void preloadAudio(lessonStrings(lesson), ['f', 'm'], ['normal']);
  }, [lesson]);

  const commit = (next: LessonSnapshot) => {
    setSnap(next);
    setPending(null);
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  const item = snap.phase === 'exercises' ? snap.queue[snap.pos] : undefined;
  const ex = item ? lesson.exercises[item.ex] : undefined;

  return (
    <main className={`lesson${pending ? ' lesson--feedback' : ''}`}>
      <div ref={topRef} className="lesson-top">
        <button className="icon-close" onClick={() => navigate('/')} aria-label="Close lesson">
          ✕
        </button>
        <ProgressBar value={progressFraction(snap, teachCount)} label="Lesson progress" />
        {preview && <PreviewBanner compact />}
      </div>

      {snap.phase === 'intro' && <Intro lesson={lesson} onStart={() => commit({ ...snap, phase: teachCount ? 'teach' : 'exercises' })} />}

      {snap.phase === 'teach' && (
        <section className="teach">
          {snap.teachIndex < lesson.teach.length ? (
            <TeachCardView key={snap.teachIndex} card={lesson.teach[snap.teachIndex]!} />
          ) : (
            <VocabCard vocab={lesson.vocab} />
          )}
          <div className="teach-nav">
            <button
              className="tile tile--light"
              disabled={snap.teachIndex === 0}
              onClick={() => commit({ ...snap, teachIndex: snap.teachIndex - 1 })}
            >
              Atrás
            </button>
            <button
              className="tile"
              onClick={() =>
                commit(
                  snap.teachIndex + 1 < teachCount
                    ? { ...snap, teachIndex: snap.teachIndex + 1 }
                    : { ...snap, phase: 'exercises', pos: 0 },
                )
              }
            >
              {snap.teachIndex + 1 < teachCount ? 'Siguiente' : '¡A practicar!'}
            </button>
          </div>
          <p className="muted small center">
            <span className="num">
              {snap.teachIndex + 1} / {teachCount}
            </span>
          </p>
        </section>
      )}

      {ex && item && (
        <section className="exercise">
          <p className="ex-prompt">
            {item.retry && <span className="retry-tag">Otra vez</span>}
            {ex.prompt ?? defaultPrompt(ex)}
          </p>
          <ExerciseView
            key={`${snap.pos}`}
            ex={ex}
            voice={item.voice}
            answered={pending !== null}
            onAnswer={(a) => setPending(a)}
          />
        </section>
      )}

      {pending && ex && (
        <Feedback answer={pending} ex={ex} onContinue={() => commit(answer(snap, lesson, pending.correct, pending.note))} />
      )}

      {snap.phase === 'done' && <Finish lesson={lesson} snap={snap} preview={preview} />}
    </main>
  );
}

function Intro({ lesson, onStart }: { lesson: DayLesson; onStart: () => void }) {
  const { play, playing } = usePlay();
  return (
    <section className="intro">
      <p className="eyebrow">Día {lesson.day}</p>
      <button className="intro-title" onClick={() => play(lesson.title.es, 'f')} data-playing={playing !== null || undefined} lang="es-ES">
        {lesson.title.es}
      </button>
      <p className="muted intro-en">{lesson.title.en}</p>
      <h2 className="intro-h">Today you'll</h2>
      <ul className="objectives">
        {lesson.objectives.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>
      <p className="muted small">
        <span className="num">{lesson.vocab.length}</span> new words · <span className="num">{lesson.exercises.length}</span> exercises · about
        20 minutes. Headphones help.
      </p>
      <button className="tile tile--block tile--terra intro-go" onClick={onStart}>
        Empezar
      </button>
    </section>
  );
}

function Feedback({ answer: a, ex, onContinue }: { answer: Answer; ex: Exercise; onContinue: () => void }) {
  // Enter continues, so a typed answer can be checked and moved past from the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return;
      e.preventDefault();
      onContinue();
    };
    // Attach after the Enter that submitted the answer has finished.
    const t = setTimeout(() => window.addEventListener('keydown', onKey), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onContinue]);
  const kind = a.correct === true ? 'ok' : a.correct === false ? 'bad' : 'neutral';
  const title =
    a.correct === true ? '¡Bien!' : a.correct === false ? 'Casi…' : a.note === 'skipped' ? 'Saltado' : a.note === 'close' ? '¡Muy bien!' : 'Vale';
  const en = 'en' in ex && ex.type !== 'repeat' && ex.type !== 'shadow' ? ex.en : undefined;
  return (
    <div className={`feedback feedback--${kind}`} role="status">
      <p className={`feedback-title ${kind === 'ok' ? 'stamp' : kind === 'bad' ? 'shake' : ''}`}>{title}</p>
      {a.correct === false && a.solution && (
        <p className="feedback-solution" lang="es-ES">
          {a.solution}
        </p>
      )}
      {a.correct === false && en && <p className="feedback-en">{en}</p>}
      {a.message && <p className="feedback-msg">{a.message}</p>}
      <button className={`tile tile--block ${kind === 'bad' ? 'tile--terra' : ''}`} onClick={onContinue}>
        Continuar
      </button>
    </div>
  );
}

function Finish({ lesson, snap, preview }: { lesson: DayLesson; snap: LessonSnapshot; preview: boolean }) {
  const s = useMemo(() => score(snap), [snap]);
  const pct = s.graded ? Math.round((s.correct / s.graded) * 100) : 100;
  const missed = s.missed.map((id) => lesson.exercises.find((e) => e.id === id)).filter(Boolean) as Exercise[];
  return (
    <section className="finish">
      <p className="eyebrow">Día {lesson.day} · hecho</p>
      <h1 className="finish-title stamp">¡Enhorabuena!</h1>
      <p className="finish-score">
        <span className="num finish-num">{pct}%</span>
        <span className="muted">
          right first time (<span className="num">{s.correct}</span> of <span className="num">{s.graded}</span>)
        </span>
      </p>
      {preview && <p className="muted small">Preview run: saved separately, doesn't count towards your streak.</p>}
      {missed.length > 0 && (
        <div className="finish-missed">
          <h2 className="intro-h">Worth another look</h2>
          <ul>
            {missed.map((e) => (
              <li key={e.id} lang="es-ES">
                {'es' in e ? e.es.replace(/\{\{|\}\}/g, '') : 'audio' in e ? e.audio : e.pairs.map((p) => p[0]).join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link to="/" className="tile tile--block">
        Volver al inicio
      </Link>
    </section>
  );
}
