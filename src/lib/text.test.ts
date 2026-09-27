import { describe, expect, it } from 'vitest';
import { audioKey } from '../content/audioStrings';
import { numberToSpanish } from './spanishNumbers';
import { checkTyped, scoringText, stripAccents } from './text';

describe('audio keys preserve accents', () => {
  it('papá ≠ papa', () => {
    expect(audioKey('papá')).not.toBe(audioKey('papa'));
    expect(audioKey('  Hola,   ¿qué  tal? ')).toBe('Hola, ¿qué tal?');
    // NFD input normalises to the same key as NFC
    expect(audioKey('papá')).toBe(audioKey('papá'));
  });
});

describe('scoring normalisation', () => {
  it('strips accents but keeps ñ', () => {
    expect(stripAccents('mañana, papá, pingüino')).toBe('mañana, papa, pinguino');
  });
  it('spells out digits', () => {
    expect(scoringText('Tengo 5 años.')).toBe('tengo cinco años');
    expect(numberToSpanish(21)).toBe('veintiuno');
    expect(numberToSpanish(45)).toBe('cuarenta y cinco');
    expect(numberToSpanish(100)).toBe('cien');
  });
});

describe('checkTyped (dictation)', () => {
  it('accepts exact answers ignoring case and punctuation', () => {
    expect(checkTyped('hola que tal', 'Hola, ¿qué tal?').result).toBe('accent');
    expect(checkTyped('hola qué tal', 'Hola, ¿qué tal?').result).toBe('correct');
  });
  it('accepts missing accents but flags them', () => {
    expect(checkTyped('papa', 'papá')).toEqual({ result: 'accent', expected: 'papá' });
  });
  it('treats n for ñ as wrong', () => {
    expect(checkTyped('manana', 'mañana').result).toBe('wrong');
  });
  it('uses accept alternatives', () => {
    expect(checkTyped('5', 'cinco', ['5']).result).toBe('correct');
  });
});
