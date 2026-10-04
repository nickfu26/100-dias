import { describe, expect, it } from 'vitest';
import type { DayLesson } from '../content/types';
import { answer, newSnapshot, score, type LessonSnapshot } from '../lesson/session';
import { completeDay, realProgress, streakOf } from './store';

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

describe('skipping a speaking exercise', () => {
  it('still completes the day and counts for the streak', () => {
    const lesson = {
      day: 2,
      exercises: [
        { id: 'd002-01', type: 'repeat', es: 'hola', en: 'hi' },
        { id: 'd002-02', type: 'shadow', es: 'adiós' },
        { id: 'd002-03', type: 'dictation', es: 'sí' },
      ],
    } as DayLesson;
    let s: LessonSnapshot = { ...newSnapshot(lesson), phase: 'exercises' };
    s = answer(s, lesson, null, 'skipped');
    s = answer(s, lesson, null, 'skipped');
    s = answer(s, lesson, true);
    expect(s.phase).toBe('done'); // skips are not re-queued
    const sc = score(s);
    expect(sc).toEqual({ correct: 1, graded: 1, missed: [] }); // skips don't count against the score

    completeDay(lesson.day, sc.correct, sc.graded, '2026-10-04');
    const p = realProgress.get();
    expect(p.completed[2]?.lastCompletedOn).toBe('2026-10-04');
    expect(streakOf(p.activeDates, '2026-10-04')).toEqual({ days: 1, activeToday: true });
  });
});
