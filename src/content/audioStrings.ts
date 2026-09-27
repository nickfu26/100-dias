import type { AppAudio, Checkpoint, DayLesson, Exercise, Person, TeachCard } from './types';
import { PERSON_SPOKEN } from './types';

/**
 * Audio lookup key: exact text, Unicode NFC, trimmed, internal whitespace collapsed.
 * Accents, case and punctuation are preserved — "papá" and "papa" are different keys.
 */
export function audioKey(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** "Un {{zumo}} de naranja." → "Un zumo de naranja." */
export function fillBlankSentence(es: string): string {
  return es.replace(/\{\{([^{}]+)\}\}/, '$1');
}

/** "Un {{zumo}} de naranja." → "zumo" */
export function fillBlankAnswer(es: string): string {
  return /\{\{([^{}]+)\}\}/.exec(es)?.[1] ?? '';
}

function teachStrings(card: TeachCard): string[] {
  switch (card.kind) {
    case 'note':
      return [];
    case 'sound':
      return card.examples;
    case 'minimalPair':
      return [card.a, card.b];
    case 'conjugation':
      return [
        card.verb,
        ...(Object.keys(card.forms) as Person[]).map((p) => `${PERSON_SPOKEN[p]} ${card.forms[p]}`),
      ];
    case 'phrase':
      return [card.es];
  }
}

export function exerciseStrings(ex: Exercise): string[] {
  switch (ex.type) {
    case 'listen-choose':
      return (ex.optionsLang ?? 'es') === 'es' ? [ex.audio, ...ex.options] : [ex.audio];
    case 'match-pairs':
      return ex.pairs.map(([es]) => es);
    case 'fill-blank':
      return [fillBlankSentence(ex.es)];
    case 'build-sentence':
    case 'dictation':
    case 'repeat':
    case 'shadow':
      return [ex.es];
  }
}

export function lessonStrings(lesson: DayLesson): string[] {
  return [
    lesson.title.es,
    ...lesson.teach.flatMap(teachStrings),
    ...lesson.vocab.map((v) => v.es),
    ...lesson.exercises.flatMap(exerciseStrings),
  ];
}

export function checkpointStrings(cp: Checkpoint): string[] {
  return [cp.title.es, ...cp.exercises.flatMap(exerciseStrings)];
}

export function appAudioStrings(a: AppAudio): string[] {
  return a.phrases.map((p) => p.es);
}

export function uniqueKeys(strings: string[]): string[] {
  return [...new Set(strings.map(audioKey).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}
