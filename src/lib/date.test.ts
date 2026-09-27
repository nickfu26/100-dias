import { describe, expect, it } from 'vitest';
import { courseDayOn, dateKeyForDay, daysBetween, localDateKey, unlockedThrough } from './date';

describe('course calendar (local dates)', () => {
  it('maps start and end dates', () => {
    expect(courseDayOn('2026-10-01')).toBe(1);
    expect(dateKeyForDay(100)).toBe('2027-01-08');
    expect(courseDayOn('2027-01-08')).toBe(100);
  });
  it('is locked before the start and capped after the end', () => {
    expect(unlockedThrough('2026-09-26')).toBe(0);
    expect(unlockedThrough('2026-10-03')).toBe(3);
    expect(unlockedThrough('2027-03-01')).toBe(100);
  });
  it('ignores DST changes (Spain: 2026-10-25)', () => {
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
  it('uses local date components, not UTC', () => {
    // 23:30 local on 30 Sep is still 30 Sep locally even if UTC is already 1 Oct.
    const d = new Date(2026, 8, 30, 23, 30);
    expect(localDateKey(d)).toBe('2026-09-30');
  });
});
