// FSRS cards, one per vocab id. Ratings come from exercise results:
//   wrong first time → Again · right on the end-of-lesson retry → Hard · right first time → Good.
// New words take a one-day learning step, so every word comes back the next day before
// FSRS spaces it out (a perfect Día 1 still gives Día 2 its reviews).
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { Exercise } from '../content/types';
import type { ItemResult } from '../lesson/session';
import { persisted, useStore, type Store } from '../lib/persisted';
import { localDateKey } from '../lib/date';
import { settingsStore, useSettings } from '../lib/settings';

export interface StoredCard extends Omit<Card, 'due' | 'last_review'> {
  due: string; // ISO
  last_review?: string; // ISO
  introducedOn: string; // local YYYY-MM-DD
}
export type CardMap = Record<string, StoredCard>;

export const realCards = persisted<CardMap>('100dias.cards.v1', {});
export const previewCards = persisted<CardMap>('100dias.cards.preview.v1', {});
export const activeCards = (): Store<CardMap> => (settingsStore.get().preview ? previewCards : realCards);

export function useCards(): CardMap {
  const { preview } = useSettings();
  const real = useStore(realCards);
  const prev = useStore(previewCards);
  return preview ? prev : real;
}

const scheduler = fsrs(
  generatorParameters({
    enable_fuzz: true,
    enable_short_term: true,
    learning_steps: ['1d', '1d'], // Again, Hard and Good on a new word all mean "see it tomorrow"
    relearning_steps: ['1d'],
    maximum_interval: 365,
  }),
);

function toStored(card: Card, introducedOn: string): StoredCard {
  const { due, last_review, ...rest } = card;
  return { ...rest, due: due.toISOString(), ...(last_review ? { last_review: last_review.toISOString() } : {}), introducedOn };
}

export function gradeCard(prev: StoredCard | undefined, grade: Grade, now: Date): StoredCard {
  const base = prev ? { ...prev, due: new Date(prev.due), last_review: prev.last_review ? new Date(prev.last_review) : undefined } : createEmptyCard(now);
  const { card } = scheduler.next(base, now, grade);
  return toStored(card, prev?.introducedOn ?? localDateKey(now));
}

/** Apply one rating per vocab id (a session's worst result for that word). */
export function applyRatings(ratings: Record<string, Grade>, now = new Date(), store = activeCards()) {
  if (!Object.keys(ratings).length) return;
  store.set((cards) => {
    const next = { ...cards };
    for (const [id, grade] of Object.entries(ratings)) next[id] = gradeCard(cards[id], grade, now);
    return next;
  });
}

/** Worst grade per vocab id across a session's graded exercises. Ungraded results are ignored. */
export function sessionRatings(exercises: Exercise[], results: Record<string, ItemResult>): Record<string, Grade> {
  const out: Record<string, Grade> = {};
  for (const ex of exercises) {
    const r = results[ex.id];
    if (!r || r.firstTry === null) continue;
    const grade: Grade = r.firstTry ? Rating.Good : r.retryCorrect ? Rating.Hard : Rating.Again;
    for (const id of ex.vocab ?? []) out[id] = out[id] === undefined ? grade : (Math.min(out[id], grade) as Grade);
  }
  return out;
}

/** Cards due by the end of the given local day, most overdue first. */
export function dueIds(cards: CardMap, today = localDateKey()): string[] {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  return Object.entries(cards)
    .filter(([, c]) => new Date(c.due).getTime() <= endOfDay)
    .sort(([, a], [, b]) => a.due.localeCompare(b.due) || a.stability - b.stability)
    .map(([id]) => id);
}

export const isNewish = (c: StoredCard) => c.state === State.New || c.state === State.Learning || c.reps <= 1;
