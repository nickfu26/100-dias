import { describe, expect, it } from 'vitest';
import type { DayLesson } from '../content/types';
import { answer, newSnapshot, progressFraction, score, voiceFor, type LessonSnapshot } from './session';

const lesson = {
  day: 1,
  level: 1,
  title: { en: 't', es: 't' },
  objectives: ['o'],
  teach: [{ kind: 'note', md: 'x' }],
  vocab: [],
  exercises: [
    { id: 'd001-01', type: 'dictation', es: 'hola' },
    { id: 'd001-02', type: 'repeat', es: 'hola', en: 'hi' },
    { id: 'd001-03', type: 'dictation', es: 'sí', voice: 'm' },
  ],
} as DayLesson;

describe('session', () => {
  it('alternates voices unless pinned', () => {
    expect(voiceFor(lesson.exercises[0]!, 0)).toBe('f');
    expect(voiceFor(lesson.exercises[1]!, 1)).toBe('m');
    expect(voiceFor(lesson.exercises[2]!, 2)).toBe('m');
  });

  it('re-queues a first-time miss once, in the other voice, and scores first tries only', () => {
    let s: LessonSnapshot = { ...newSnapshot(lesson), phase: 'exercises' };
    s = answer(s, lesson, false); // d001-01 wrong → retry appended
    expect(s.queue).toHaveLength(4);
    expect(s.queue[3]).toEqual({ ex: 0, voice: 'm', retry: true });
    s = answer(s, lesson, false); // repeat wrong → never re-queued
    expect(s.queue).toHaveLength(4);
    s = answer(s, lesson, true);
    expect(s.phase).toBe('exercises');
    s = answer(s, lesson, true); // the retry
    expect(s.phase).toBe('done');
    expect(s.results['d001-01']).toEqual({ firstTry: false, retryCorrect: true });
    expect(score(s)).toEqual({ correct: 1, graded: 3, missed: ['d001-01', 'd001-02'] });
  });

  it('does not grade skipped speaking', () => {
    let s: LessonSnapshot = { ...newSnapshot(lesson), phase: 'exercises', pos: 1 };
    s = answer(s, lesson, null, 'skipped');
    expect(s.results['d001-02']).toEqual({ firstTry: null, note: 'skipped' });
    expect(score(s).graded).toBe(0);
  });

  it('progress runs from 0 to 1 across teach cards and exercises', () => {
    const s = newSnapshot(lesson);
    expect(progressFraction(s, 1)).toBe(0);
    expect(progressFraction({ ...s, phase: 'exercises', pos: 1 }, 1)).toBe(0.5);
    expect(progressFraction({ ...s, phase: 'done', pos: 3 }, 1)).toBe(1);
  });
});
