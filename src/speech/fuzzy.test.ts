import { describe, expect, it } from 'vitest';
import { bestScore, scoreSpeech } from './fuzzy';

describe('scoreSpeech', () => {
  it('perfect match regardless of accents/punctuation/case', () => {
    const s = scoreSpeech('¿Cómo os llamáis?', 'como os llamais');
    expect(s.score).toBe(1);
    expect(s.words.map((w) => w.status)).toEqual(['ok', 'ok', 'ok']);
  });
  it('flags a missing word', () => {
    const s = scoreSpeech('Un zumo de naranja, por favor.', 'un zumo de naranja favor');
    expect(s.words.find((w) => w.word === 'por')?.status).toBe('missed');
    expect(s.words.find((w) => w.word === 'favor.')?.status).toBe('ok');
    expect(s.score).toBeGreaterThan(0.8);
  });
  it('marks near misses as close', () => {
    const s = scoreSpeech('perro', 'pero');
    expect(s.words[0]?.status).toBe('close');
  });
  it('handles digits returned by the recogniser', () => {
    expect(scoreSpeech('Tengo cinco años.', 'tengo 5 años').score).toBe(1);
  });
  it('collects extra words', () => {
    const s = scoreSpeech('Vale, gracias.', 'vale muchas gracias');
    expect(s.extra).toEqual(['muchas']);
    expect(s.score).toBe(1);
  });
  it('picks the best alternative', () => {
    expect(bestScore('caza', ['casa', 'caza'])?.score).toBe(1);
  });
});
