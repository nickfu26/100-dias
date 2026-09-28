// Turns due FSRS cards into review exercises, using only strings that already have audio
// (each vocab item's `es`).
import { AVAILABLE_DAYS, loadDay } from '../content/loader';
import type { Exercise, VocabItem } from '../content/types';
import { numberToSpanish } from '../lib/spanishNumbers';
import { isNewish, type CardMap } from './cards';

export type IndexedVocab = VocabItem & { day: number };
export type VocabIndex = Map<string, IndexedVocab>;

let indexPromise: Promise<VocabIndex> | null = null;

/** Every vocab item in the course, by id (lesson chunks are small and precached). */
export function loadVocabIndex(): Promise<VocabIndex> {
  indexPromise ??= Promise.all(AVAILABLE_DAYS.map(loadDay)).then((lessons) => {
    const m: VocabIndex = new Map();
    for (const l of lessons) for (const v of l?.vocab ?? []) m.set(v.id, { ...v, day: l!.day });
    return m;
  });
  return indexPromise;
}

export const MAX_REVIEW_CARDS = 20;
export const MAX_REVIEW_EXERCISES = 10;
const SINGLES_WHEN_GROUPING = 6;

const words = (s: string) => s.replace(/[¿?¡!.,…]/g, ' ').trim().split(/\s+/).filter(Boolean);
const bare = (es: string) => es.replace(/^(el|la|los|las)\s+/i, '');

function shuffle<T>(a: T[], rng: () => number): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [x[i], x[j]] = [x[j]!, x[i]!];
  }
  return x;
}

/** Typed answers that also count: the noun without its article, a number as digits. */
function acceptFor(v: VocabItem): string[] {
  const acc = new Set<string>();
  if (bare(v.es) !== v.es) acc.add(bare(v.es));
  if (v.pos === 'num') {
    for (let n = 0; n <= 100; n++) if (numberToSpanish(n) === v.es) acc.add(String(n));
  }
  return [...acc];
}

function meaningChoice(v: IndexedVocab, pool: IndexedVocab[], rng: () => number): Exercise {
  const others = shuffle(
    pool.filter((o) => o.id !== v.id && o.en !== v.en),
    rng,
  ).sort((a, b) => Number(b.pos === v.pos) - Number(a.pos === v.pos)); // same part of speech first
  const options = shuffle([v.en, ...others.slice(0, 2).map((o) => o.en)], rng);
  return { id: `rv-${v.id}`, type: 'listen-choose', audio: v.es, optionsLang: 'en', options, answer: options.indexOf(v.en), vocab: [v.id] };
}

function single(v: IndexedVocab, i: number, newish: boolean, pool: IndexedVocab[], rng: () => number): Exercise {
  const multi = words(v.es).length >= 2 && (v.pos === 'phrase' || !/^(el|la) /.test(v.es));
  if (!newish && multi) {
    const distractor = shuffle(
      pool.filter((o) => words(o.es).length === 1 && !words(v.es).includes(o.es)),
      rng,
    )[0];
    return { id: `rv-${v.id}`, type: 'build-sentence', es: v.es, en: v.en, distractors: distractor ? [distractor.es] : [], vocab: [v.id] };
  }
  // New-ish words alternate recognition and spelling; mature single words are spelled.
  if (newish && i % 2 === 0) return meaningChoice(v, pool, rng);
  const accept = acceptFor(v);
  return { id: `rv-${v.id}`, type: 'dictation', es: v.es, hint: v.en, ...(accept.length ? { accept } : {}), vocab: [v.id] };
}

/**
 * Review exercises for the given due card ids (most overdue first). At most
 * MAX_REVIEW_EXERCISES exercises; beyond a handful of singles, cards are bundled into
 * match-pairs so up to MAX_REVIEW_CARDS words fit.
 */
export function buildReviews(ids: string[], cards: CardMap, index: VocabIndex, rng: () => number = Math.random): Exercise[] {
  const due = ids.map((id) => index.get(id)).filter((v): v is IndexedVocab => !!v).slice(0, MAX_REVIEW_CARDS);
  if (!due.length) return [];
  const pool = [...index.values()].filter((v) => cards[v.id]); // only words the learner has met
  const grouping = due.length > 8;
  const singles = grouping ? due.slice(0, SINGLES_WHEN_GROUPING) : due;
  const rest = grouping ? due.slice(SINGLES_WHEN_GROUPING) : [];

  const out: Exercise[] = singles.map((v, i) => single(v, i, isNewish(cards[v.id]!), pool, rng));

  // Match-pairs of 3–5 with distinct English glosses.
  const groups: IndexedVocab[][] = [];
  for (const v of rest) {
    const g = groups.find((g) => g.length < 5 && !g.some((o) => o.en === v.en));
    if (g) g.push(v);
    else groups.push([v]);
  }
  groups.forEach((g, n) => {
    if (g.length >= 3) {
      out.push({ id: `rv-m${n}`, type: 'match-pairs', pairs: g.map((v) => [v.es, v.en] as [string, string]), vocab: g.map((v) => v.id) });
    } else {
      g.forEach((v, i) => out.push(single(v, i, isNewish(cards[v.id]!), pool, rng)));
    }
  });
  return shuffle(out, rng).slice(0, MAX_REVIEW_EXERCISES);
}
