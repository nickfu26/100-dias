import { useEffect, useState } from 'react';
import { ListenButtons } from '../components/AudioButtons';
import { usePlay } from '../components/usePlay';
import type { Dictation as D } from '../content/types';
import { checkTyped } from '../lib/text';
import { TypeAnswer } from './TypeAnswer';
import type { ExerciseProps } from './types';

export function Dictation({ ex, voice, answered, onAnswer }: ExerciseProps<D>) {
  const [typed, setTyped] = useState('');
  const [verdict, setVerdict] = useState<'ok' | 'bad' | 'warn' | undefined>();
  const [hint, setHint] = useState(false);
  const { play } = usePlay();

  useEffect(() => {
    void play(ex.es, voice);
  }, [ex.es, voice, play]);

  function submit() {
    const v = checkTyped(typed, ex.es, ex.accept);
    setVerdict(v.result === 'correct' ? 'ok' : v.result === 'accent' ? 'warn' : 'bad');
    onAnswer({
      correct: v.result !== 'wrong',
      solution: ex.es,
      message: v.result === 'accent' ? `Watch the accent: ${ex.es}` : undefined,
    });
  }

  return (
    <div className="ex">
      <ListenButtons text={ex.es} voice={voice} big />
      <TypeAnswer value={typed} onChange={setTyped} onSubmit={submit} disabled={answered} state={verdict} />
      {ex.hint && !answered && (
        <p className="center">
          {hint ? (
            <span className="muted">Pista: {ex.hint}</span>
          ) : (
            <button className="link-btn" onClick={() => setHint(true)}>
              Pista (hint)
            </button>
          )}
        </p>
      )}
    </div>
  );
}
