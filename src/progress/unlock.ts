import { localDateKey, unlockedThrough } from '../lib/date';

/** A day unlocks on its calendar date (local time) and stays open for catch-up. Preview opens everything. */
export function isDayUnlocked(day: number, preview: boolean, today = localDateKey()): boolean {
  return preview || day <= unlockedThrough(today);
}
