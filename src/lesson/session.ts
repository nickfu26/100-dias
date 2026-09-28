// Pure lesson-session logic: the queue of exercises, voices, retries and scoring.
// Kept free of React so it can be unit-tested and snapshotted to storage as plain JSON.
import type { Voice } from '../audio/manifest';
import type { DayLesson, Exercise } from '../content/types';

export type Phase = 'intro' | 'teach' | 'exercises' | 'done';

export interface SessionItem {
  /** Index into allExercises(): the lesson's exercises, then the generated reviews */
  ex: number;
  voice: Voice;
  /** A second attempt at an exercise missed earlier in this session. */
  retry: boolean;
}

export interface ItemResult {
  /** true = right first time; false = wrong first time; null = not graded (skipped, or self-rated shadowing) */
  firstTry: boolean | null;
  /** Shadowing self-rating, or a skipped speaking exercise. */
  note?: 'close' | 'needs-work' | 'skipped';
  /** Right on the retry at the end of the session. */
  retryCorrect?: boolean;
}

export interface LessonSnapshot {
  day: number;
  startedAt: string; // ISO
  updatedAt: string; // ISO
  phase: Phase;
  teachIndex: number;
  queue: SessionItem[];
  pos: number;
  results: Record<string, ItemResult>; // by exercise id
  /** Exercise ids when the run started; a saved run is only resumed if the lesson still matches. */
  exIds?: string;
  /** Review exercises generated from due FSRS cards when the run started. */
  reviews?: Exercise[];
  /** Tests (checkpoints) don't re-queue misses: one attempt per exercise. */
  noRetry?: boolean;
}

export const allExercises = (lesson: DayLesson, s: LessonSnapshot): Exercise[] => [...lesson.exercises, ...(s.reviews ?? [])];
export const isReviewItem = (lesson: DayLesson, item: SessionItem) => item.ex >= lesson.exercises.length;

const fingerprint = (lesson: DayLesson) => lesson.exercises.map((e) => e.id).join(',');

/** A saved run can resume only if it belongs to this exact version of the lesson. */
export function canResume(s: LessonSnapshot | undefined, lesson: DayLesson): s is LessonSnapshot {
  return (
    !!s &&
    s.day === lesson.day &&
    s.exIds === fingerprint(lesson) &&
    s.phase !== 'done' &&
    s.queue.every((q) => q.ex >= 0 && q.ex < lesson.exercises.length + (s.reviews?.length ?? 0)) &&
    s.pos <= s.queue.length &&
    s.teachIndex >= 0
  );
}

/** Speaking exercises are not re-queued: a retry would just repeat the same attempt. */
const NO_RETRY: Exercise['type'][] = ['repeat', 'shadow'];

export function voiceFor(ex: Exercise, position: number): Voice {
  if (ex.voice === 'f' || ex.voice === 'm') return ex.voice;
  return position % 2 === 0 ? 'f' : 'm';
}

export function newSnapshot(lesson: DayLesson, reviews: Exercise[] = [], now = new Date(), opts: { noRetry?: boolean } = {}): LessonSnapshot {
  const all = [...lesson.exercises, ...reviews];
  return {
    day: lesson.day,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    phase: 'intro',
    teachIndex: 0,
    queue: all.map((ex, i) => ({ ex: i, voice: voiceFor(ex, i), retry: false })),
    pos: 0,
    results: {},
    exIds: fingerprint(lesson),
    ...(reviews.length ? { reviews } : {}),
    ...(opts.noRetry ? { noRetry: true } : {}),
  };
}

/**
 * Record the answer for the current item and advance. A first-time miss is queued again
 * at the end (with the other voice), once.
 */
export function answer(s: LessonSnapshot, lesson: DayLesson, correct: boolean | null, note?: ItemResult['note']): LessonSnapshot {
  const item = s.queue[s.pos];
  if (!item) return s;
  const ex = allExercises(lesson, s)[item.ex]!;
  const results = { ...s.results };
  let queue = s.queue;
  if (item.retry) {
    results[ex.id] = { ...results[ex.id]!, retryCorrect: correct === true };
  } else {
    results[ex.id] = { firstTry: correct, ...(note ? { note } : {}) };
    if (correct === false && !s.noRetry && !NO_RETRY.includes(ex.type)) {
      queue = [...queue, { ex: item.ex, voice: item.voice === 'f' ? 'm' : 'f', retry: true }];
    }
  }
  const pos = s.pos + 1;
  return { ...s, queue, pos, results, phase: pos >= queue.length ? 'done' : 'exercises', updatedAt: new Date().toISOString() };
}

export interface Score {
  correct: number; // right first time
  graded: number; // exercises with a right/wrong result
  missed: string[]; // exercise ids wrong first time
}

export function score(s: LessonSnapshot): Score {
  const vals = Object.entries(s.results);
  const graded = vals.filter(([, r]) => r.firstTry !== null);
  return {
    correct: graded.filter(([, r]) => r.firstTry).length,
    graded: graded.length,
    missed: graded.filter(([, r]) => r.firstTry === false).map(([id]) => id),
  };
}

/** 0..1 through the whole lesson (teach cards + exercise queue) for the top progress bar. */
export function progressFraction(s: LessonSnapshot, teachCount: number): number {
  const total = teachCount + s.queue.length;
  if (total === 0) return 1;
  const done =
    s.phase === 'intro' ? 0 : s.phase === 'teach' ? s.teachIndex : s.phase === 'exercises' ? teachCount + s.pos : total;
  return Math.min(1, done / total);
}
