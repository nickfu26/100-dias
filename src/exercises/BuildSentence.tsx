import { useEffect, useState } from 'react';
import { ListenButtons } from '../components/AudioButtons';
import { usePlay } from '../components/usePlay';
import type { BuildSentence as BS } from '../content/types';
import { looseText } from '../lib/text';
import { shuffleNotIdentity, type ExerciseProps } from './types';

interface Tile {
  id: number;
  text: string;
}

export function BuildSentence({ ex, voice, answered, onAnswer }: ExerciseProps<BS>) {
  const audioOnly = ex.direction === 'audio-to-es';
  const [tiles] = useState<Tile[]>(() =>
    shuffleNotIdentity([...ex.es.split(/\s+/), ...(ex.distractors ?? [])].map((text, id) => ({ id, text }))),
  );
  const [picked, setPicked] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const { play } = usePlay();

  useEffect(() => {
    if (audioOnly) void play(ex.es, voice);
  }, [audioOnly, ex.es, voice, play]);

  const byId = (id: number) => tiles.find((t) => t.id === id)!;

  function check() {
    const built = picked.map((id) => byId(id).text).join(' ');
    // Case and punctuation don't matter; "Hola, ¿qué tal?" == "hola qué tal"
    const ok = looseText(built) === looseText(ex.es);
    setResult(ok);
    onAnswer({ correct: ok, solution: ex.es });
    void play(ex.es, voice);
  }

  return (
    <div className="ex">
      {audioOnly ? <ListenButtons text={ex.es} voice={voice} big /> : <p className="ex-source">{ex.en}</p>}
      <div className={`build-line${result === true ? ' build-line--ok' : result === false ? ' build-line--bad' : ''}`} aria-label="Your sentence">
        {picked.map((id) => (
          <button key={id} className="word-tile" lang="es-ES" disabled={answered} onClick={() => setPicked((p) => p.filter((x) => x !== id))}>
            {byId(id).text}
          </button>
        ))}
      </div>
      <div className="bank" aria-label="Word tiles">
        {tiles.map((t) => {
          const used = picked.includes(t.id);
          return (
            <button
              key={t.id}
              className={`word-tile${used ? ' word-tile--used' : ''}`}
              lang="es-ES"
              disabled={answered || used}
              onClick={() => setPicked((p) => [...p, t.id])}
            >
              {t.text}
            </button>
          );
        })}
      </div>
      {!answered && (
        <button className="tile tile--block" disabled={picked.length === 0} onClick={check}>
          Comprobar
        </button>
      )}
      {answered && audioOnly && <p className="ex-en center">{ex.en}</p>}
    </div>
  );
}
