import type { Exercise } from '../content/types';
import { BuildSentence } from './BuildSentence';
import { Dictation } from './Dictation';
import { FillBlank } from './FillBlank';
import { ListenChoose } from './ListenChoose';
import { MatchPairs } from './MatchPairs';
import { Repeat } from './Repeat';
import { Shadow } from './Shadow';
import type { ExerciseProps } from './types';

export function defaultPrompt(ex: Exercise): string {
  switch (ex.type) {
    case 'listen-choose':
      return (ex.optionsLang ?? 'es') === 'es' ? 'What do you hear?' : 'What does it mean?';
    case 'match-pairs':
      return 'Match the pairs';
    case 'fill-blank':
      return 'Complete the sentence';
    case 'build-sentence':
      return ex.direction === 'audio-to-es' ? 'Build what you hear' : 'Say this in Spanish';
    case 'dictation':
      return 'Type what you hear';
    case 'repeat':
      return 'Say it aloud';
    case 'shadow':
      return 'Listen, record yourself, compare';
  }
}

export function ExerciseView(props: ExerciseProps<Exercise>) {
  const { ex } = props;
  switch (ex.type) {
    case 'listen-choose':
      return <ListenChoose {...props} ex={ex} />;
    case 'match-pairs':
      return <MatchPairs {...props} ex={ex} />;
    case 'fill-blank':
      return <FillBlank {...props} ex={ex} />;
    case 'build-sentence':
      return <BuildSentence {...props} ex={ex} />;
    case 'dictation':
      return <Dictation {...props} ex={ex} />;
    case 'repeat':
      return <Repeat {...props} ex={ex} />;
    case 'shadow':
      return <Shadow {...props} ex={ex} />;
  }
}
