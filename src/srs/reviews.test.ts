import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { gradeCard, type CardMap } from './cards';
import { buildReviews, MAX_REVIEW_EXERCISES, type VocabIndex } from './reviews';

const vocab = [
  ['hola', 'hola', 'hello', 'interj'],
  ['gracias', 'gracias', 'thank you', 'interj'],
  ['cafe', 'el café', 'the coffee', 'noun'],
  ['buenos-dias', 'buenos días', 'good morning', 'phrase'],
  ['que-tal', '¿Qué tal?', "How's it going?", 'phrase'],
  ['cinco', 'cinco', 'five', 'num'],
  ['casa', 'la casa', 'the house', 'noun'],
  ['mesa', 'la mesa', 'the table', 'noun'],
  ['no', 'no', 'no, not', 'adv'],
  ['vale', 'vale', 'OK', 'interj'],
  ['perro', 'el perro', 'the dog', 'noun'],
  ['gato', 'el gato', 'the cat', 'noun'],
  ['agua', 'el agua', 'the water', 'noun'],
  ['hoy', 'hoy', 'today', 'adv'],
] as const;
const index: VocabIndex = new Map(vocab.map(([id, es, en, pos]) => [id, { id, es, en, pos, day: 1 }]));
const t0 = new Date('2026-10-01T10:00:00');
const cards: CardMap = Object.fromEntries(vocab.map(([id]) => [id, gradeCard(undefined, Rating.Good, t0)]));
let seed = 1;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('buildReviews', () => {
  it('covers every due word within the exercise cap, bundling extras into match-pairs', () => {
    const ids = vocab.map(([id]) => id);
    const ex = buildReviews(ids, cards, index, rng);
    expect(ex.length).toBeLessThanOrEqual(MAX_REVIEW_EXERCISES);
    expect(new Set(ex.flatMap((e) => e.vocab ?? []))).toEqual(new Set(ids));
    expect(ex.some((e) => e.type === 'match-pairs')).toBe(true);
    expect(new Set(ex.map((e) => e.id)).size).toBe(ex.length);
  });

  it('builds valid exercises from the vocab strings', () => {
    const ex = buildReviews(['cafe', 'cinco', 'hola', 'que-tal'], cards, index, rng);
    for (const e of ex) {
      if (e.type === 'listen-choose') {
        expect(e.options[e.answer]).toBe(index.get(e.vocab![0]!)!.en);
        expect(new Set(e.options).size).toBe(e.options.length);
      }
      if (e.type === 'dictation' && e.vocab![0] === 'cafe') expect(e.accept).toContain('café');
      if (e.type === 'dictation' && e.vocab![0] === 'cinco') expect(e.accept).toContain('5');
    }
  });

  it('asks mature phrases to be built from tiles', () => {
    const mature: CardMap = { ...cards, 'buenos-dias': gradeCard(gradeCard(cards['buenos-dias'], Rating.Good, new Date('2026-10-02T10:00:00')), Rating.Good, new Date('2026-10-09T10:00:00')) };
    const [ex] = buildReviews(['buenos-dias'], mature, index, rng);
    expect(ex!.type).toBe('build-sentence');
  });
});
