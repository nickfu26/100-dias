// Intelligibility scoring for repeat-after-me. Recognition output tells us whether the
// words were understood — NOT whether individual sounds (θ/s, r/rr, j) were right.
import { scoringText, similarity } from '../lib/text';

export type WordStatus = 'ok' | 'close' | 'missed';

export interface WordResult {
  word: string; // target word as displayed (original accents/punctuation)
  status: WordStatus;
  heard?: string; // recogniser's aligned word (scoring form)
  sim: number; // 0..1
}

export interface SpeechScore {
  score: number; // 0..1, see weighting below
  words: WordResult[];
  extra: string[]; // heard words that align to nothing in the target
  transcript: string;
}

// Recognisers output real words, so any difference means a different word was heard.
const OK = 1;
const CLOSE = 0.5;

/**
 * Global alignment (Needleman–Wunsch) of target vs heard words.
 * Substitution cost = 1 − similarity; skipping a target word costs 1; an extra heard word 0.6.
 */
export function scoreSpeech(target: string, transcript: string): SpeechScore {
  const display = target.split(/\s+/).filter((w) => scoringText(w).length > 0);
  // A display token may expand (e.g. "5" → "cinco"); compare it as one joined unit.
  const t = display.map((w) => scoringText(w));
  const h = scoringText(transcript).split(' ').filter(Boolean);

  const m = t.length, n = h.length;
  const GAP_T = 1, GAP_H = 0.6;
  const cost: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  const move: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0)); // 0 diag,1 up(skip t),2 left(extra h)
  for (let i = 1; i <= m; i++) { cost[i]![0] = i * GAP_T; move[i]![0] = 1; }
  for (let j = 1; j <= n; j++) { cost[0]![j] = j * GAP_H; move[0]![j] = 2; }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const diag = cost[i - 1]![j - 1]! + (1 - similarity(t[i - 1]!, h[j - 1]!));
      const up = cost[i - 1]![j]! + GAP_T;
      const left = cost[i]![j - 1]! + GAP_H;
      const best = Math.min(diag, up, left);
      cost[i]![j] = best;
      move[i]![j] = best === diag ? 0 : best === up ? 1 : 2;
    }
  }

  const words: WordResult[] = new Array(m);
  const extra: string[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    const mv = i === 0 ? 2 : j === 0 ? 1 : move[i]![j]!;
    if (mv === 0) {
      const sim = similarity(t[i - 1]!, h[j - 1]!);
      words[i - 1] = { word: display[i - 1]!, heard: h[j - 1], sim, status: sim >= OK ? 'ok' : sim >= CLOSE ? 'close' : 'missed' };
      i--; j--;
    } else if (mv === 1) {
      words[i - 1] = { word: display[i - 1]!, sim: 0, status: 'missed' };
      i--;
    } else {
      extra.unshift(h[j - 1]!);
      j--;
    }
  }
  // ok = 1, close = half credit (a different but similar word was heard), missed = 0
  const score = m === 0 ? 0 : words.reduce((s, w) => s + (w.status === 'ok' ? 1 : w.status === 'close' ? 0.5 : 0), 0) / m;
  return { score, words, extra, transcript };
}

/** Score every recogniser alternative and keep the best. */
export function bestScore(target: string, alternatives: string[]): SpeechScore | null {
  let best: SpeechScore | null = null;
  for (const alt of alternatives) {
    const s = scoreSpeech(target, alt);
    if (!best || s.score > best.score) best = s;
  }
  return best;
}
