import dayIndex from 'virtual:day-index';
import type { Bilingual, Checkpoint, DayLesson } from './types';

// Lessons are lazy chunks (precached by the service worker). Titles come from a tiny
// build-time index (vite.config.ts) so the home screen doesn't load every lesson.
const dayModules = import.meta.glob<DayLesson>('/content/day-*.json', { import: 'default' });
const checkpointModules = import.meta.glob<Checkpoint>('/content/checkpoint-*.json', { import: 'default' });

const dayPath = (day: number) => `/content/day-${String(day).padStart(3, '0')}.json`;

/** Days that have content files, ascending. */
export const AVAILABLE_DAYS: number[] = Object.keys(dayModules)
  .map((p) => Number(/day-(\d{3})\.json$/.exec(p)?.[1]))
  .filter((n) => n > 0)
  .sort((a, b) => a - b);

/** Levels that have a checkpoint file. */
export const AVAILABLE_CHECKPOINTS: number[] = Object.keys(checkpointModules)
  .map((p) => Number(/checkpoint-(\d+)\.json$/.exec(p)?.[1]))
  .filter((n) => n > 0);

export function dayTitle(day: number): Bilingual | undefined {
  return dayIndex[day];
}

export async function loadDay(day: number): Promise<DayLesson | null> {
  const load = dayModules[dayPath(day)];
  return load ? load() : null;
}

export async function loadCheckpoint(n: number): Promise<Checkpoint | null> {
  const load = checkpointModules[`/content/checkpoint-${n}.json`];
  return load ? load() : null;
}
