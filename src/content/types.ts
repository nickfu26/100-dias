// Mirrors content/schema.json — the schema is the documented source of truth.

export type VoicePref = 'auto' | 'f' | 'm';

export interface Bilingual {
  en: string;
  es: string;
}

export type Person = 'yo' | 'tu' | 'el' | 'nosotros' | 'vosotros' | 'ellos';

export type TeachCard =
  | { kind: 'note'; md: string }
  | { kind: 'sound'; grapheme: string; ipa: string; tip: string; examples: string[] }
  | { kind: 'minimalPair'; a: string; b: string; aEn: string; bEn: string; contrast?: string }
  | {
      kind: 'conjugation';
      verb: string;
      verbEn: string;
      tense: string;
      forms: Record<Person, string>;
    }
  | { kind: 'phrase'; es: string; en: string; note?: string };

export interface VocabItem {
  id: string;
  es: string;
  en: string;
  pos: string;
  gender?: 'm' | 'f' | 'mf';
  ipa?: string;
  note?: string;
  tags?: string[];
}

interface ExerciseBase {
  id: string;
  vocab?: string[];
  voice?: VoicePref;
  prompt?: string;
}

export interface ListenChoose extends ExerciseBase {
  type: 'listen-choose';
  audio: string;
  options: string[];
  optionsLang?: 'es' | 'en';
  answer: number;
}
export interface MatchPairs extends ExerciseBase {
  type: 'match-pairs';
  pairs: [string, string][];
}
export interface FillBlank extends ExerciseBase {
  type: 'fill-blank';
  es: string;
  en: string;
  options?: string[];
  accept?: string[];
}
export interface BuildSentence extends ExerciseBase {
  type: 'build-sentence';
  es: string;
  en: string;
  distractors?: string[];
  direction?: 'en-to-es' | 'audio-to-es';
}
export interface Dictation extends ExerciseBase {
  type: 'dictation';
  es: string;
  accept?: string[];
  hint?: string;
}
export interface Repeat extends ExerciseBase {
  type: 'repeat';
  es: string;
  en: string;
  minScore?: number;
}
export interface Shadow extends ExerciseBase {
  type: 'shadow';
  es: string;
  en: string;
  listenFor?: string;
}

export type Exercise =
  | ListenChoose
  | MatchPairs
  | FillBlank
  | BuildSentence
  | Dictation
  | Repeat
  | Shadow;

export interface DayLesson {
  day: number;
  level: number;
  title: Bilingual;
  objectives: string[];
  teach: TeachCard[];
  vocab: VocabItem[];
  exercises: Exercise[];
}

export interface Checkpoint {
  checkpoint: number;
  level: number;
  title: Bilingual;
  passMark: number;
  exercises: Exercise[];
}

export interface AppAudio {
  phrases: { es: string; en: string; note?: string }[];
}

export const PERSON_LABELS: Record<Person, string> = {
  yo: 'yo',
  tu: 'tú',
  el: 'él / ella / usted',
  nosotros: 'nosotros/as',
  vosotros: 'vosotros/as',
  ellos: 'ellos / ellas / ustedes',
};

/** Spoken pronoun used for conjugation audio ("vosotros sois"). */
export const PERSON_SPOKEN: Record<Person, string> = {
  yo: 'yo',
  tu: 'tú',
  el: 'él',
  nosotros: 'nosotros',
  vosotros: 'vosotros',
  ellos: 'ellos',
};
