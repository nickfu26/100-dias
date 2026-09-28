import { PERSON_LABELS, PERSON_SPOKEN, type Person, type TeachCard, type VocabItem } from '../content/types';
import { SayIt, VoiceRow } from '../components/AudioButtons';
import { usePlay } from '../components/usePlay';
import { Markdown } from './Markdown';

export function TeachCardView({ card }: { card: TeachCard }) {
  switch (card.kind) {
    case 'note':
      return (
        <article className="card card--note">
          <Markdown md={card.md} />
        </article>
      );
    case 'sound':
      return (
        <article className="card card--sound">
          <p className="grapheme">{card.grapheme}</p>
          <p className="ipa" aria-label={`IPA ${card.ipa}`}>
            [{card.ipa}]
          </p>
          <p className="tip">{card.tip}</p>
          <div className="examples">
            {card.examples.map((w, i) => (
              <SayIt key={w} text={w} voice={i % 2 ? 'm' : 'f'} className="chip-say" />
            ))}
          </div>
          <p className="muted small">Tap a word to hear it.</p>
        </article>
      );
    case 'minimalPair':
      return <MinimalPair card={card} />;
    case 'conjugation':
      return (
        <article className="card">
          <p className="eyebrow">Conjugación · presente</p>
          <h2 className="card-es" lang="es-ES">
            {card.verb}
          </h2>
          <p className="muted">{card.verbEn}</p>
          <table className="conj">
            <tbody>
              {(Object.keys(PERSON_LABELS) as Person[]).map((p) => (
                <tr key={p}>
                  <th scope="row">{PERSON_LABELS[p]}</th>
                  <td>
                    <SayIt text={`${PERSON_SPOKEN[p]} ${card.forms[p]}`} voice="f">
                      {card.forms[p]}
                    </SayIt>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      );
    case 'phrase':
      return (
        <article className="card card--phrase">
          <p className="eyebrow">Frase útil</p>
          <h2 className="card-es" lang="es-ES">
            {card.es}
          </h2>
          <p className="card-en">{card.en}</p>
          <VoiceRow text={card.es} />
          {card.note && <p className="card-note">{card.note}</p>}
        </article>
      );
  }
}

function MinimalPair({ card }: { card: Extract<TeachCard, { kind: 'minimalPair' }> }) {
  const { play, playing } = usePlay();
  const both = () => {
    void play(card.a, 'f', 'normal', 'a').then(() => play(card.b, 'f', 'normal', 'b'));
  };
  return (
    <article className="card">
      <p className="eyebrow">Pareja mínima{card.contrast ? ` · ${card.contrast}` : ''}</p>
      <div className="pair">
        {([['a', card.a, card.aEn], ['b', card.b, card.bEn]] as const).map(([k, es, en]) => (
          <button key={k} className="pair-side" data-playing={playing === k || undefined} onClick={() => play(es, 'f', 'normal', k)}>
            <span className="pair-es" lang="es-ES">
              {es}
            </span>
            <span className="pair-en">{en}</span>
          </button>
        ))}
      </div>
      <button className="tile tile--light tile--small pair-both" onClick={both}>
        ▶ Escuchar los dos
      </button>
    </article>
  );
}

export function VocabCard({ vocab }: { vocab: VocabItem[] }) {
  return (
    <article className="card">
      <p className="eyebrow">Palabras nuevas</p>
      <h2 className="card-title">Today's words</h2>
      <ul className="vocab">
        {vocab.map((v, i) => (
          <li key={v.id} className="vocab-row">
            <SayIt text={v.es} voice={i % 2 ? 'm' : 'f'} className="vocab-es" />
            <span className="vocab-en">{v.en}</span>
            {v.ipa && <span className="vocab-ipa">[{v.ipa}]</span>}
            {v.note && <span className="vocab-note">{v.note}</span>}
          </li>
        ))}
      </ul>
    </article>
  );
}
