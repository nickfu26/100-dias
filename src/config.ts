export const COURSE_START = '2026-10-01'; // local calendar date of Día 1
export const TOTAL_DAYS = 100;

export interface LevelDef {
  level: number;
  name: string;
  nameEs: string;
  firstDay: number;
  lastDay: number;
}

export const LEVELS: LevelDef[] = [
  { level: 1, name: 'Sounds & Letters', nameEs: 'Sonidos y letras', firstDay: 1, lastDay: 10 },
  { level: 2, name: 'Words', nameEs: 'Palabras', firstDay: 11, lastDay: 35 },
  { level: 3, name: 'Phrases', nameEs: 'Frases', firstDay: 36, lastDay: 60 },
  { level: 4, name: 'Sentences', nameEs: 'Oraciones', firstDay: 61, lastDay: 85 },
  { level: 5, name: 'Paragraphs', nameEs: 'Párrafos', firstDay: 86, lastDay: 100 },
];

export function levelForDay(day: number): LevelDef | undefined {
  return LEVELS.find((l) => day >= l.firstDay && day <= l.lastDay);
}

export const VOICES = {
  f: { id: 'es-ES-ElviraNeural', name: 'Elvira' },
  m: { id: 'es-ES-AlvaroNeural', name: 'Álvaro' },
} as const;

export const SPEECH_LANG = 'es-ES';
