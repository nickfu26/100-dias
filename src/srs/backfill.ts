import { Rating } from 'ts-fsrs';
import { loadDay } from '../content/loader';
import { activeProgress } from '../progress/store';
import { activeCards, gradeCard, type StoredCard } from './cards';

/**
 * Days completed before cards existed (or on another build) get cards for their words,
 * graded Good as of the day they were completed. Safe to run on every launch.
 */
export async function backfillCards(): Promise<number> {
  const progress = activeProgress().get();
  const store = activeCards();
  const created: Record<string, StoredCard> = {};
  for (const [day, rec] of Object.entries(progress.completed)) {
    const lesson = await loadDay(Number(day));
    for (const v of lesson?.vocab ?? []) {
      if (store.get()[v.id] || created[v.id]) continue;
      created[v.id] = gradeCard(undefined, Rating.Good, new Date(`${rec.firstCompletedOn}T12:00:00`));
    }
  }
  const n = Object.keys(created).length;
  if (n) store.set((c) => ({ ...created, ...c }));
  return n;
}
