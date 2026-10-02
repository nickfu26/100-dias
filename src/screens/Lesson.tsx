import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { preloadAudio } from '../audio/player';
import { ProgressBar } from '../components/ProgressBar';
import { PreviewBanner } from '../components/PreviewBanner';
import { usePlay } from '../components/usePlay';
import { lessonStrings } from '../content/audioStrings';
import { loadCheckpoint, loadDay } from '../content/loader';
import type { Checkpoint, DayLesson, Exercise } from '../content/types';
import { ExerciseView, defaultPrompt } from '../exercises/ExerciseView';
import { SpeakingProvider, type SpeakingSession } from '../exercises/speaking';
import type { Answer } from '../exercises/types';
import { Rating } from 'ts-fsrs';
import { allExercises, answer, canResume, isReviewItem, newSnapshot, progressFraction, score, type LessonSnapshot } from '../lesson/session';
import { TeachCardView, VocabCard } from '../lesson/TeachCardView';
import { useSettings } from '../lib/settings';
import {
  activeProgress,
  completeDay,
  discardSnapshot,
  finishReviewSession,
  recordCheckpoint,
  saveSnapshot,
  streakOf,
  useProgress,
  type CheckpointAttempt,
} from '../progress/store';
import { activeCards, applyRatings, dueIds, sessionRatings } from '../srs/cards';
import { buildReviews, loadVocabIndex } from '../srs/reviews';
import { exerciseStrings } from '../content/audioStrings';
import { isCheckpointUnlocked, isDayUnlocked } from '../progress/unlock';
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

/** A review-only session: no new material, just the words due today. */
const REVIEW_LESSON: DayLesson = {
  day: 0,
  level: 1,
  title: { es: 'Repaso', en: 'Review' },
  objectives: ['Bring back the words that are due today, before they fade'],
  teach: [],
  vocab: [],
  exercises: [],
};

export function Review() {
  const { preview } = useSettings();
  const { key } = useLocation(); // each visit is a fresh session
  return <LessonRun key={`review-${preview}-${key}`} lesson={REVIEW_LESSON} preview={preview} />;
}

interface TestInfo {
  n: number;
  passMark: number;
}

/** A checkpoint runs through the lesson player as exercises only, stored under day −N. */
function checkpointLesson(cp: Checkpoint): DayLesson {
  return {
    day: -cp.checkpoint,
    level: cp.level,
    title: cp.title,
    objectives: ['Show you can hear, read, spell and say everything from this level'],
    teach: [],
    vocab: [],
    exercises: cp.exercises,
  };
}

export function CheckpointScreen() {
  const n = Number(useParams().n);
  const { preview } = useSettings();
  const progress = useProgress();
  const { key } = useLocation();
  const [cp, setCp] = useState<Checkpoint | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadCheckpoint(n).then((c) => alive && setCp(c));
    return () => {
      alive = false;
    };
  }, [n]);
  const lesson = useMemo(() => (cp ? checkpointLesson(cp) : null), [cp]);

  if (cp === undefined) return <Message text="Cargando…" />;
  if (cp === null || !lesson) return <Message text={`There is no test for level ${n} yet.`} />;
  if (!isCheckpointUnlocked(cp.level, preview, progress.completed))
    return <Message text={`The level ${n} test opens once every day of the level is done.`} />;
  return <LessonRun key={`cp-${n}-${preview}-${key}`} lesson={lesson} preview={preview} test={{ n, passMark: cp.passMark }} />;
}

/** Due cards → review exercises (null while loading). Words introduced in this lesson are left out. */
function useReviews(lesson: DayLesson, skip: boolean): Exercise[] | null {
  const [reviews, setReviews] = useState<Exercise[] | null>(skip ? [] : null);
  useEffect(() => {
    if (skip) return;
    let alive = true;
    const fallback = setTimeout(() => alive && setReviews((r) => r ?? []), 4000); // never block the lesson
    loadVocabIndex()
      .then((index) => {
        const cards = activeCards().get();
        const today = new Set(lesson.vocab.map((v) => v.id));
        const built = buildReviews(dueIds(cards).filter((id) => !today.has(id)), cards, index);
        if (alive) setReviews(built);
        void preloadAudio(built.flatMap(exerciseStrings), ['f', 'm'], ['normal']);
      })
      .catch(() => alive && setReviews([]));
    return () => {
      alive = false;
      clearTimeout(fallback);
    };
  }, [lesson, skip]);
  return reviews;
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

function LessonRun({ lesson, preview, test }: { lesson: DayLesson; preview: boolean; test?: TestInfo }) {
  const navigate = useNavigate();
  const [snap, setSnap] = useState<LessonSnapshot>(() => newSnapshot(lesson));
  // A half-finished run of this lesson, offered on the intro screen.
  const [saved, setSaved] = useState<LessonSnapshot | null>(() => {
    const s = activeProgress().get().inProgress[lesson.day];
    return canResume(s, lesson) ? s : null;
  });
  const [pending, setPending] = useState<Answer | null>(null);
  const teachCount = lesson.teach.length + (lesson.vocab.length ? 1 : 0);
  const topRef = useRef<HTMLDivElement>(null);
  const reviews = useReviews(lesson, !!test);
  const [attempt, setAttempt] = useState<CheckpointAttempt | null>(null);
  const fresh = () => newSnapshot(lesson, reviews ?? [], new Date(), { noRetry: !!test });
  const { speakingMode } = useSettings();
  // Once recognition fails and the learner opts out, 🎤 exercises are record & compare until the lesson closes.
  const [recordSession, setRecordSession] = useState(false);
  const speaking = useMemo<SpeakingSession>(
    () => ({
      recordOnly: speakingMode === 'record' || recordSession,
      reason: speakingMode === 'record' ? 'Speaking mode is Record & compare (Ajustes).' : recordSession ? 'Record & compare for the rest of this lesson.' : undefined,
      recordRestOfSession: () => setRecordSession(true),
    }),
    [speakingMode, recordSession],
  );

  // Warm today's audio (both voices, normal speed) so taps play instantly and offline.
  useEffect(() => {
    void preloadAudio(lessonStrings(lesson), ['f', 'm'], ['normal']);
  }, [lesson]);

  // Every step is saved, so closing the app (or iOS killing it) resumes at the same card.
  const commit = (next: LessonSnapshot) => {
    setSnap(next);
    setPending(null);
    if (next.phase === 'done') {
      // FSRS: one rating per word from this run; every new word of the lesson gets a card.
      const ratings = sessionRatings(allExercises(lesson, next), next.results);
      const cards = activeCards().get();
      for (const v of lesson.vocab) if (ratings[v.id] === undefined && !cards[v.id]) ratings[v.id] = Rating.Good;
      applyRatings(ratings);
      const sc = score(next);
      if (test) setAttempt(recordCheckpoint(test.n, sc.correct, sc.graded, test.passMark));
      else if (lesson.day > 0) completeDay(lesson.day, sc.correct, sc.graded);
      else finishReviewSession();
    } else if (next.phase !== 'intro') {
      saveSnapshot(next);
    }
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  const item = snap.phase === 'exercises' ? snap.queue[snap.pos] : undefined;
  const ex = item ? allExercises(lesson, snap)[item.ex] : undefined;

  return (
    <main className={`lesson${pending ? ' lesson--feedback' : ''}`}>
      <div ref={topRef} className="lesson-top">
        <button className="icon-close" onClick={() => navigate('/')} aria-label="Close lesson">
          ✕
        </button>
        <ProgressBar value={progressFraction(snap, teachCount)} label="Lesson progress" />
        {preview && <PreviewBanner compact />}
      </div>

      {snap.phase === 'intro' && (
        <Intro
          lesson={lesson}
          saved={saved}
          reviews={reviews}
          test={test}
          onStart={() => {
            if (saved) discardSnapshot(lesson.day);
            setSaved(null);
            commit({ ...fresh(), phase: teachCount ? 'teach' : 'exercises' });
          }}
          onResume={() => {
            if (!saved) return;
            setSaved(null);
            commit({ ...saved, updatedAt: new Date().toISOString() });
          }}
        />
      )}

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
            {item.retry ? (
              <span className="retry-tag">Otra vez</span>
            ) : (
              isReviewItem(lesson, item) && <span className="retry-tag retry-tag--review">Repaso</span>
            )}
            {ex.prompt ?? defaultPrompt(ex)}
          </p>
          <SpeakingProvider value={speaking}>
            <ExerciseView
              key={`${snap.pos}`}
              ex={ex}
              voice={item.voice}
              answered={pending !== null}
              onAnswer={(a) => setPending(a)}
            />
          </SpeakingProvider>
        </section>
      )}

      {pending && ex && (
        <Feedback answer={pending} ex={ex} onContinue={() => commit(answer(snap, lesson, pending.correct, pending.note))} />
      )}

      {snap.phase === 'done' &&
        (test ? (
          <TestResult lesson={lesson} snap={snap} test={test} attempt={attempt} onRetry={() => commit({ ...fresh(), phase: 'exercises' })} />
        ) : (
          <Finish lesson={lesson} snap={snap} preview={preview} />
        ))}
    </main>
  );
}

function Intro({
  lesson,
  saved,
  reviews,
  test,
  onStart,
  onResume,
}: {
  lesson: DayLesson;
  saved: LessonSnapshot | null;
  reviews: Exercise[] | null;
  test?: TestInfo;
  onStart: () => void;
  onResume: () => void;
}) {
  const { play, playing } = usePlay();
  const record = useProgress().checkpoints?.[test?.n ?? -1];
  const reviewOnly = lesson.day === 0;
  const reviewWords = new Set((reviews ?? []).flatMap((r) => r.vocab ?? [])).size;
  if (reviewOnly && reviews?.length === 0 && !saved) {
    return (
      <section className="intro">
        <p className="eyebrow">Repaso</p>
        <h1 className="intro-title">Nada que repasar</h1>
        <p className="muted intro-en">Nothing is due today. FSRS will bring words back when they start to fade.</p>
        <Link to="/" className="tile tile--block">
          Volver al inicio
        </Link>
      </section>
    );
  }
  return (
    <section className="intro">
      <p className="eyebrow">{test ? `Prueba · Nivel ${test.n}` : reviewOnly ? 'Repaso' : `Día ${lesson.day}`}</p>
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
      {test ? (
        <div className="test-rules">
          <p>
            <span className="num">{lesson.exercises.length}</span> exercises covering every sound and word of the level. To pass you need{' '}
            <strong className="num">{Math.round(test.passMark * 100)}%</strong> right first time.
          </p>
          <p className="muted small">
            No second chances inside the test, and speaking exercises aren't scored. You can retake it as often as you like.
          </p>
          {record && record.attempts.length > 0 && (
            <p className="muted small">
              {record.passedOn ? '✓ Passed. ' : ''}
              Attempts: <span className="num">{record.attempts.length}</span> · best{' '}
              <span className="num">
                {Math.max(...record.attempts.map((a) => (a.graded ? Math.round((a.correct / a.graded) * 100) : 0)))}%
              </span>
            </p>
          )}
        </div>
      ) : (
      <p className="muted small">
        {!reviewOnly && (
          <>
            <span className="num">{lesson.vocab.length}</span> new words · <span className="num">{lesson.exercises.length}</span> exercises
          </>
        )}
        {reviews === null ? (
          ' · checking reviews…'
        ) : reviews.length > 0 ? (
          <>
            {reviewOnly ? '' : ' + '}
            <span className="num">{reviews.length}</span> review {reviews.length === 1 ? 'exercise' : 'exercises'} (
            <span className="num">{reviewWords}</span> {reviewWords === 1 ? 'word' : 'words'})
          </>
        ) : null}
        {reviewOnly ? '.' : ' · about 20 minutes. Headphones help.'}
      </p>
      )}
      {saved ? (
        <div className="resume">
          <p className="resume-where">
            You stopped at{' '}
            {saved.phase === 'teach' ? (
              <>
                card <span className="num">{saved.teachIndex + 1}</span>
              </>
            ) : (
              <>
                exercise <span className="num">{Math.min(saved.pos + 1, saved.queue.length)}</span> of{' '}
                <span className="num">{saved.queue.length}</span>
              </>
            )}
            .
          </p>
          <button className="tile tile--block tile--terra" onClick={onResume}>
            Continuar
          </button>
          <button className="tile tile--block tile--light" onClick={onStart}>
            Empezar de nuevo
          </button>
        </div>
      ) : (
        <button className="tile tile--block tile--terra intro-go" onClick={onStart} disabled={reviews === null}>
          {reviews === null ? 'Preparando…' : 'Empezar'}
        </button>
      )}
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
  const streak = streakOf(useProgress().activeDates);
  const pct = s.graded ? Math.round((s.correct / s.graded) * 100) : 100;
  const missed = s.missed.map((id) => lesson.exercises.find((e) => e.id === id)).filter(Boolean) as Exercise[];
  return (
    <section className="finish">
      <p className="eyebrow">{lesson.day ? `Día ${lesson.day} · hecho` : 'Repaso · hecho'}</p>
      <h1 className="finish-title stamp">¡Enhorabuena!</h1>
      <p className="finish-score">
        <span className="num finish-num">{pct}%</span>
        <span className="muted">
          right first time (<span className="num">{s.correct}</span> of <span className="num">{s.graded}</span>)
        </span>
      </p>
      {preview ? (
        <p className="muted small">Preview run: saved separately, doesn't count towards your streak.</p>
      ) : (
        <p className="finish-streak">
          <span className="num">{streak.days}</span> {streak.days === 1 ? 'día seguido' : 'días seguidos'}
        </p>
      )}
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

function TestResult({
  lesson,
  snap,
  test,
  attempt,
  onRetry,
}: {
  lesson: DayLesson;
  snap: LessonSnapshot;
  test: TestInfo;
  attempt: CheckpointAttempt | null;
  onRetry: () => void;
}) {
  const s = score(snap);
  const pct = s.graded ? Math.round((s.correct / s.graded) * 100) : 0;
  const passed = attempt?.passed ?? pct >= test.passMark * 100;
  const need = Math.ceil(test.passMark * s.graded);
  const missed = s.missed.map((id) => lesson.exercises.find((e) => e.id === id)).filter(Boolean) as Exercise[];
  return (
    <section className="finish">
      <p className="eyebrow">Prueba · Nivel {test.n}</p>
      <h1 className={`finish-title stamp${passed ? '' : ' finish-title--fail'}`}>{passed ? '¡Aprobado!' : 'Casi…'}</h1>
      <p className="finish-score">
        <span className="num finish-num">{pct}%</span>
        <span className="muted">
          <span className="num">{s.correct}</span> of <span className="num">{s.graded}</span> right first time · pass mark{' '}
          <span className="num">{Math.round(test.passMark * 100)}%</span>
        </span>
      </p>
      <p>
        {passed
          ? `Level ${test.n} is done. ¡Enhorabuena! Keep up the daily reviews and it will stay with you.`
          : `You needed ${need}. Look over the ones below, then have another go. Retakes are unlimited.`}
      </p>
      {missed.length > 0 && (
        <div className="finish-missed">
          <h2 className="intro-h">{passed ? 'Worth another look' : 'To practise'}</h2>
          <ul>
            {missed.map((e) => (
              <li key={e.id} lang="es-ES">
                {'es' in e ? e.es.replace(/\{\{|\}\}/g, '') : 'audio' in e ? e.audio : e.pairs.map((p) => p[0]).join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!passed && (
        <button className="tile tile--block tile--terra" onClick={onRetry}>
          Repetir la prueba
        </button>
      )}
      <Link to="/" className={`tile tile--block${passed ? '' : ' tile--light'}`}>
        Volver al inicio
      </Link>
      {passed && (
        <button className="link-btn" onClick={onRetry}>
          Retake it anyway
        </button>
      )}
    </section>
  );
}
