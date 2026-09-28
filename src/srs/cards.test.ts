import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import type { Exercise } from '../content/types';
import { localDateKey } from '../lib/date';
import { dueIds, gradeCard, sessionRatings } from './cards';

const at = (s: string) => new Date(s);
const day = (iso: string) => localDateKey(new Date(iso));

describe('FSRS schedule', () => {
  it('brings every new word back the next day, then spaces it out', () => {
    const c1 = gradeCard(undefined, Rating.Good, at('2026-10-01T10:00:00'));
    expect(day(c1.due)).toBe('2026-10-02');
    expect(c1.introducedOn).toBe('2026-10-01');
    const c2 = gradeCard(c1, Rating.Good, at('2026-10-02T09:00:00'));
    expect(new Date(c2.due).getTime()).toBeGreaterThanOrEqual(at('2026-10-04T00:00:00').getTime());
    const hard = gradeCard(undefined, Rating.Hard, at('2026-10-01T10:00:00'));
    expect(day(hard.due)).toBe('2026-10-02');
  });

  it('a lapse comes back the next day', () => {
    let c = gradeCard(undefined, Rating.Good, at('2026-10-01T10:00:00'));
    c = gradeCard(c, Rating.Good, at('2026-10-02T10:00:00'));
    c = gradeCard(c, Rating.Again, at('2026-10-06T10:00:00'));
    expect(day(c.due)).toBe('2026-10-07');
  });

  it('due = by the end of the local day, most overdue first', () => {
    const a = gradeCard(undefined, Rating.Good, at('2026-10-01T22:00:00')); // due Oct 2 22:00
    const b = gradeCard(undefined, Rating.Good, at('2026-10-01T08:00:00')); // due Oct 2 08:00
    expect(dueIds({ a, b }, '2026-10-02')).toEqual(['b', 'a']);
    expect(dueIds({ a, b }, '2026-10-01')).toEqual([]);
  });
});

describe('sessionRatings', () => {
  const exs = [
    { id: 'x1', type: 'dictation', es: 'hola', vocab: ['hola'] },
    { id: 'x2', type: 'dictation', es: 'sí', vocab: ['si-yes', 'hola'] },
    { id: 'x3', type: 'dictation', es: 'no', vocab: ['no'] },
    { id: 'x4', type: 'repeat', es: 'adiós', en: 'bye', vocab: ['adios'] },
  ] as Exercise[];
  it('takes the worst grade per word and ignores ungraded results', () => {
    const r = sessionRatings(exs, {
      x1: { firstTry: true },
      x2: { firstTry: false, retryCorrect: true },
      x3: { firstTry: false, retryCorrect: false },
      x4: { firstTry: null, note: 'skipped' },
    });
    expect(r).toEqual({ hola: Rating.Hard, 'si-yes': Rating.Hard, no: Rating.Again });
  });
});
