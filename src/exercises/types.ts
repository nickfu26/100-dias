import type { Voice } from '../audio/manifest';

export interface Answer {
  /** true right, false wrong, null ungraded (speaking skipped, shadowing self-rated) */
  correct: boolean | null;
  /** The right answer, shown when wrong. */
  solution?: string;
  /** Extra line under the verdict, e.g. "Watch the accent: café". */
  message?: string;
  note?: 'close' | 'needs-work' | 'skipped';
}

export interface ExerciseProps<E> {
  ex: E;
  voice: Voice;
  /** Once answered, the exercise shows its result and ignores input. */
  answered: boolean;
  onAnswer: (a: Answer) => void;
}

export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Shuffle, but never leave the items in their original order (when that's possible). */
export function shuffleNotIdentity<T>(items: readonly T[]): T[] {
  if (items.length < 2) return [...items];
  for (let tries = 0; tries < 8; tries++) {
    const s = shuffle(items);
    if (s.some((x, i) => x !== items[i])) return s;
  }
  return [...items.slice(1), items[0]!];
}
