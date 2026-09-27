// Writes every Spanish string that needs audio to scripts/.cache/audio-strings.json,
// which scripts/generate_audio.py consumes. Extraction rules live in src/content/audioStrings.ts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appAudioStrings, checkpointStrings, lessonStrings, uniqueKeys } from '../src/content/audioStrings';
import { loadContent, ROOT } from './lib/content';

const { days, checkpoints, appAudio } = loadContent();
const keys = uniqueKeys([
  ...days.flatMap((d) => lessonStrings(d.data)),
  ...checkpoints.flatMap((c) => checkpointStrings(c.data)),
  ...appAudioStrings(appAudio.data),
]);

const outDir = join(ROOT, 'scripts', '.cache');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'audio-strings.json'), JSON.stringify(keys, null, 2) + '\n', 'utf8');
console.log(`${keys.length} unique Spanish strings from ${days.length} days, ${checkpoints.length} checkpoints + app audio.`);
