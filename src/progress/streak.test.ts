import { describe, expect, it } from 'vitest';
import { streakOf } from './store';

describe('streakOf', () => {
  it('counts consecutive days ending today', () => {
    expect(streakOf(['2026-10-01', '2026-10-02', '2026-10-03'], '2026-10-03')).toEqual({ days: 3, activeToday: true });
  });
  it('keeps yesterday’s streak alive until today ends', () => {
    expect(streakOf(['2026-10-01', '2026-10-02'], '2026-10-03')).toEqual({ days: 2, activeToday: false });
  });
  it('resets after a missed day', () => {
    expect(streakOf(['2026-10-01'], '2026-10-03')).toEqual({ days: 0, activeToday: false });
    expect(streakOf(['2026-10-01', '2026-10-03'], '2026-10-03')).toEqual({ days: 1, activeToday: true });
  });
  it('crosses month ends', () => {
    expect(streakOf(['2026-10-31', '2026-11-01'], '2026-11-01').days).toBe(2);
  });
});
