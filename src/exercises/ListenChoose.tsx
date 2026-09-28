import { useEffect, useState } from 'react';
import { ListenButtons } from '../components/AudioButtons';
import { usePlay } from '../components/usePlay';
import type { ListenChoose as LC } from '../content/types';
import type { ExerciseProps } from './types';

export function ListenChoose({ ex, voice, answered, onAnswer }: ExerciseProps<LC>) {
  const [chosen, setChosen] = useState<number | null>(null);
  const { play } = usePlay();
  const es = (ex.optionsLang ?? 'es') === 'es';

  // Play once on arrival. The shared audio element was unlocked by an earlier tap;
  // if the browser still refuses, the Escuchar button is right there.
  useEffect(() => {
    void play(ex.audio, voice);
  }, [ex.audio, voice, play]);

  function pick(i: number) {
    if (answered) {
      if (es) void play(ex.options[i]!, voice); // compare the options by ear afterwards
      return;
    }
    setChosen(i);
    onAnswer({ correct: i === ex.answer, solution: ex.options[ex.answer] });
  }

  return (
    <div className="ex">
      <ListenButtons text={ex.audio} voice={voice} big />
      <div className={`options${ex.options.length > 3 ? ' options--grid' : ''}`}>
        {ex.options.map((o, i) => {
          const state = !answered ? '' : i === ex.answer ? 'ok' : i === chosen ? 'bad' : 'dim';
          return (
            <button key={o} className={`option ${state ? `option--${state}` : ''}`} onClick={() => pick(i)} lang={es ? 'es-ES' : undefined}>
              {o}
            </button>
          );
        })}
      </div>
      {answered && es && <p className="muted small center">Tap the options to hear each one.</p>}
    </div>
  );
}
