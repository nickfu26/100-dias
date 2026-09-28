// Course progress: completed days, active dates (for the streak) and half-finished lessons.
// Two separate profiles: real progress, and preview progress (Preview mode) that never
// touches real completion or the streak.
import { persisted, useStore, type Store } from '../lib/persisted';
import { addDays, localDateKey } from '../lib/date';
import { settingsStore, useSettings } from '../lib/settings';
import type { LessonSnapshot } from '../lesson/session';

export interface DayRecord {
  firstCompletedOn: string; // local YYYY-MM-DD
  lastCompletedOn: string;
  correct: number; // first-try correct on the latest run
  graded: number;
}

export interface CheckpointAttempt {
  on: string; // local YYYY-MM-DD
  correct: number;
  graded: number;
  passed: boolean;
}
export interface CheckpointRecord {
  attempts: CheckpointAttempt[];
  passedOn?: string;
}

export interface ProgressData {
  completed: Record<string, DayRecord>; // by day number
  /** Local dates on which at least one lesson was finished. */
  activeDates: string[];
  inProgress: Record<string, LessonSnapshot>; // by day number (0 = review, −N = checkpoint N)
  checkpoints?: Record<string, CheckpointRecord>; // by level
}

const EMPTY: ProgressData = { completed: {}, activeDates: [], inProgress: {} };
const parse = (raw: unknown): ProgressData => ({ ...EMPTY, ...(raw as Partial<ProgressData>) });

export const realProgress = persisted<ProgressData>('100dias.progress.v1', EMPTY, parse);
export const previewProgress = persisted<ProgressData>('100dias.progress.preview.v1', EMPTY, parse);

export function activeProgress(): Store<ProgressData> {
  return settingsStore.get().preview ? previewProgress : realProgress;
}

export function useProgress(): ProgressData {
  const { preview } = useSettings();
  const real = useStore(realProgress);
  const prev = useStore(previewProgress);
  return preview ? prev : real;
}

export function saveSnapshot(s: LessonSnapshot) {
  activeProgress().set((p) => ({ ...p, inProgress: { ...p.inProgress, [s.day]: s } }));
}

export function discardSnapshot(day: number) {
  activeProgress().set((p) => {
    const { [day]: _, ...rest } = p.inProgress;
    return { ...p, inProgress: rest };
  });
}

export function completeDay(day: number, correct: number, graded: number, today = localDateKey()) {
  activeProgress().set((p) => {
    const prev = p.completed[day];
    const { [day]: _, ...inProgress } = p.inProgress;
    return {
      completed: {
        ...p.completed,
        [day]: { firstCompletedOn: prev?.firstCompletedOn ?? today, lastCompletedOn: today, correct, graded },
      },
      activeDates: p.activeDates.includes(today) ? p.activeDates : [...p.activeDates, today].sort(),
      inProgress,
    };
  });
}

/** Record a checkpoint attempt; it also counts for the streak. */
export function recordCheckpoint(n: number, correct: number, graded: number, passMark: number, today = localDateKey()): CheckpointAttempt {
  const attempt: CheckpointAttempt = { on: today, correct, graded, passed: graded > 0 && correct / graded >= passMark };
  activeProgress().set((p) => {
    const prev = p.checkpoints?.[n] ?? { attempts: [] };
    const { [-n]: _, ...inProgress } = p.inProgress;
    return {
      ...p,
      checkpoints: {
        ...p.checkpoints,
        [n]: { attempts: [...prev.attempts, attempt], passedOn: prev.passedOn ?? (attempt.passed ? today : undefined) },
      },
      activeDates: p.activeDates.includes(today) ? p.activeDates : [...p.activeDates, today].sort(),
      inProgress,
    };
  });
  return attempt;
}

/** A review-only session counts for the streak but completes no day. It's saved under day 0. */
export function finishReviewSession(today = localDateKey()) {
  activeProgress().set((p) => {
    const { 0: _, ...inProgress } = p.inProgress;
    return {
      ...p,
      activeDates: p.activeDates.includes(today) ? p.activeDates : [...p.activeDates, today].sort(),
      inProgress,
    };
  });
}

export function resetPreviewProgress() {
  previewProgress.set(EMPTY);
}

export interface Streak {
  days: number; // consecutive active days ending today, or yesterday if today isn't done yet
  activeToday: boolean;
}

/** A streak survives until the end of the day after the last active day. */
export function streakOf(activeDates: string[], today = localDateKey()): Streak {
  const set = new Set(activeDates);
  const activeToday = set.has(today);
  let cursor = activeToday ? today : addDays(today, -1);
  let days = 0;
  while (set.has(cursor)) {
    days++;
    cursor = addDays(cursor, -1);
  }
  return { days, activeToday };
}
