import { useState } from 'react';
import { usePlay } from '../components/usePlay';
import { fillBlankAnswer, fillBlankSentence } from '../content/audioStrings';
import type { FillBlank as FB } from '../content/types';
import { checkTyped } from '../lib/text';
import { TypeAnswer } from './TypeAnswer';
import { shuffle, type ExerciseProps } from './types';

export function FillBlank({ ex, voice, answered, onAnswer }: ExerciseProps<FB>) {
  const answer = fillBlankAnswer(ex.es);
  const sentence = fillBlankSentence(ex.es);
  const [before, after] = ex.es.split(/\{\{[^{}]+\}\}/) as [string, string];
  const [options] = useState(() => (ex.options ? shuffle(ex.options) : null));
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [verdict, setVerdict] = useState<'ok' | 'bad' | 'warn' | undefined>();
  const { play } = usePlay();

  function finish(correct: boolean, message?: string) {
    onAnswer({ correct, solution: sentence, message });
    void play(sentence, voice); // hear the whole sentence once it's complete
  }

  function pick(o: string) {
    if (answered) return;
    setChosen(o);
    finish(o === answer);
  }

  function submit() {
    const v = checkTyped(typed, answer, ex.accept);
    setVerdict(v.result === 'correct' ? 'ok' : v.result === 'accent' ? 'warn' : 'bad');
    finish(v.result !== 'wrong', v.result === 'accent' ? `Watch the accent: ${answer}` : undefined);
  }

  const shown = answered ? answer : options ? (chosen ?? '') : typed;
  return (
    <div className="ex">
      <p className="blank-sentence" lang="es-ES">
        {before}
        <span className={`blank${answered ? ' blank--filled' : ''}`}>{shown || ' '}</span>
        {after}
      </p>
      <p className="ex-en">{ex.en}</p>
      {options ? (
        <div className="options">
          {options.map((o) => {
            const state = !answered ? '' : o === answer ? 'ok' : o === chosen ? 'bad' : 'dim';
            return (
              <button key={o} className={`option ${state ? `option--${state}` : ''}`} onClick={() => pick(o)} lang="es-ES">
                {o}
              </button>
            );
          })}
        </div>
      ) : (
        <TypeAnswer value={typed} onChange={setTyped} onSubmit={submit} disabled={answered} state={verdict} />
      )}
    </div>
  );
}
