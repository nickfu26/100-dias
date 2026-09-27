import { COURSE_START, TOTAL_DAYS } from '../config';

/** YYYY-MM-DD for the device's LOCAL calendar date (never UTC). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toUtcMidnight(key: string): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Whole calendar days from a to b (b − a). DST-proof: compares calendar dates, not instants. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMidnight(b) - toUtcMidnight(a)) / 86_400_000);
}

export function addDays(key: string, n: number): string {
  const t = new Date(toUtcMidnight(key) + n * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/** Course day number for a local date: 1 on COURSE_START, ≤0 before, >TOTAL_DAYS after the end. */
export function courseDayOn(key: string = localDateKey()): number {
  return daysBetween(COURSE_START, key) + 1;
}

/** Highest unlocked day (0 = course not started), capped at TOTAL_DAYS. */
export function unlockedThrough(key: string = localDateKey()): number {
  return Math.max(0, Math.min(TOTAL_DAYS, courseDayOn(key)));
}

export function dateKeyForDay(day: number): string {
  return addDays(COURSE_START, day - 1);
}

export function formatLongEs(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}
