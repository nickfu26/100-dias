import { useEffect, useRef, useState } from 'react';
import { usePlay } from '../components/usePlay';
import type { MatchPairs as MP } from '../content/types';
import { shuffle, type ExerciseProps } from './types';

type Side = 'es' | 'en';

export function MatchPairs({ ex, voice, answered, onAnswer }: ExerciseProps<MP>) {
  const [esOrder] = useState(() => shuffle(ex.pairs.map((_, i) => i)));
  const [enOrder] = useState(() => shuffle(ex.pairs.map((_, i) => i)));
  const [sel, setSel] = useState<{ side: Side; i: number } | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<{ es: number; en: number } | null>(null);
  const mistakes = useRef(0);
  const { play } = usePlay();

  useEffect(() => {
    if (!wrong) return;
    const t = setTimeout(() => setWrong(null), 450);
    return () => clearTimeout(t);
  }, [wrong]);

  function tap(side: Side, i: number) {
    if (answered || matched.has(i)) return;
    if (side === 'es') void play(ex.pairs[i]![0], voice);
    if (!sel || sel.side === side) {
      setSel({ side, i });
      return;
    }
    const esI = side === 'es' ? i : sel.i;
    const enI = side === 'en' ? i : sel.i;
    setSel(null);
    if (esI === enI) {
      const next = new Set(matched).add(esI);
      setMatched(next);
      if (next.size === ex.pairs.length) {
        const m = mistakes.current;
        onAnswer({ correct: m === 0, message: m ? `${m} wrong ${m === 1 ? 'match' : 'matches'} on the way.` : undefined });
      }
    } else {
      mistakes.current++;
      setWrong({ es: esI, en: enI });
    }
  }

  const cls = (side: Side, i: number) =>
    [
      'match',
      matched.has(i) && 'match--done',
      sel?.side === side && sel.i === i && 'match--sel',
      wrong && wrong[side] === i && 'match--bad shake',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div className="ex">
      <div className="matches">
        <div className="match-col">
          {esOrder.map((i) => (
            <button key={i} className={cls('es', i)} onClick={() => tap('es', i)} lang="es-ES" disabled={matched.has(i)}>
              {ex.pairs[i]![0]}
            </button>
          ))}
        </div>
        <div className="match-col">
          {enOrder.map((i) => (
            <button key={i} className={cls('en', i)} onClick={() => tap('en', i)} disabled={matched.has(i)}>
              {ex.pairs[i]![1]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
