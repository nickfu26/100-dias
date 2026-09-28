import { LEVELS } from '../config';
import { localDateKey, unlockedThrough } from '../lib/date';

/** A day unlocks on its calendar date (local time) and stays open for catch-up. Preview opens everything. */
export function isDayUnlocked(day: number, preview: boolean, today = localDateKey()): boolean {
  return preview || day <= unlockedThrough(today);
}

/** A checkpoint opens once every day of its level is complete (or in Preview). */
export function isCheckpointUnlocked(level: number, preview: boolean, completed: Record<string, unknown>): boolean {
  if (preview) return true;
  const l = LEVELS.find((x) => x.level === level);
  if (!l) return false;
  for (let d = l.firstDay; d <= l.lastDay; d++) if (!completed[d]) return false;
  return true;
}
