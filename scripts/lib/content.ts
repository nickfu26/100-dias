import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppAudio, Checkpoint, DayLesson } from '../../src/content/types';

export const ROOT = join(import.meta.dirname, '..', '..');
export const CONTENT_DIR = join(ROOT, 'content');
export const AUDIO_DIR = join(ROOT, 'public', 'audio');

export interface LoadedFile<T> {
  file: string;
  data: T;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(CONTENT_DIR, file), 'utf8')) as T;
}

export function loadContent() {
  const files = readdirSync(CONTENT_DIR).sort();
  const days: LoadedFile<DayLesson>[] = files
    .filter((f) => /^day-\d{3}\.json$/.test(f))
    .map((file) => ({ file, data: readJson<DayLesson>(file) }));
  const checkpoints: LoadedFile<Checkpoint>[] = files
    .filter((f) => /^checkpoint-\d\.json$/.test(f))
    .map((file) => ({ file, data: readJson<Checkpoint>(file) }));
  const appAudio: LoadedFile<AppAudio> = { file: 'app-audio.json', data: readJson<AppAudio>('app-audio.json') };
  const stray = files.filter(
    (f) =>
      f.endsWith('.json') &&
      !/^day-\d{3}\.json$/.test(f) &&
      !/^checkpoint-\d\.json$/.test(f) &&
      !['schema.json', 'app-audio.json', 'app-audio.schema.json'].includes(f),
  );
  return { days, checkpoints, appAudio, stray };
}
