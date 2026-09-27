import { numberToSpanish } from './spanishNumbers';

const PUNCT = /[¿?¡!.,;:"'“”‘’«»()\[\]…–—-]/g;

export function stripAccents(s: string): string {
  // Keep ñ distinct from n: it is a different letter, not an accent.
  return s
    .normalize('NFD')
    .replace(/ñ/g, '\u0000')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0000/g, 'ñ')
    .normalize('NFC');
}

/** Lowercase, no punctuation, single spaces. Accents KEPT. */
export function looseText(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
}

/** For speech scoring only: looseText + accents stripped + digits spelled out. */
export function scoringText(s: string): string {
  const spelled = looseText(s).replace(/\d+/g, (m) => numberToSpanish(Number(m)) ?? m);
  return stripAccents(spelled);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n]!;
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

// ---------- Typed answers (dictation, typed fill-blank) ----------

export type TypedVerdict =
  | { result: 'correct' }
  | { result: 'accent'; expected: string } // right letters, accents missing/wrong → accepted, flagged
  | { result: 'wrong'; expected: string };

/**
 * Case- and punctuation-insensitive. Accent mistakes are accepted but flagged so the UI
 * can show "watch the accent". ñ vs n counts as a wrong letter.
 */
export function checkTyped(input: string, expected: string, accept: string[] = []): TypedVerdict {
  const inLoose = looseText(input);
  const candidates = [expected, ...accept];
  if (candidates.some((c) => looseText(c) === inLoose)) return { result: 'correct' };
  const inBare = stripAccents(inLoose);
  if (candidates.some((c) => stripAccents(looseText(c)) === inBare)) return { result: 'accent', expected };
  return { result: 'wrong', expected };
}
