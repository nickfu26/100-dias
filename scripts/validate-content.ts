// Validates content/*.json against content/schema.json plus cross-file rules.
// Usage: npm run validate [-- --strict-audio]
//   --strict-audio  fail if any Spanish string lacks generated audio (used in CI)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { LEVELS, levelForDay } from '../src/config';
import {
  appAudioStrings,
  checkpointStrings,
  fillBlankAnswer,
  lessonStrings,
  uniqueKeys,
} from '../src/content/audioStrings';
import type { Exercise } from '../src/content/types';
import { AUDIO_DIR, CONTENT_DIR, loadContent } from './lib/content';

const strictAudio = process.argv.includes('--strict-audio');
const errors: string[] = [];
const warnings: string[] = [];
const err = (file: string, msg: string) => errors.push(`${file}: ${msg}`);

const ajv = new Ajv2020({ allErrors: true, strict: false });
const readSchema = (f: string) => JSON.parse(readFileSync(join(CONTENT_DIR, f), 'utf8'));
type AjvError = { keyword: string; instancePath: string; message?: string; params: Record<string, unknown> };
const describe = (errs: AjvError[] | null | undefined) =>
  (errs ?? [])
    .filter((e) => e.keyword !== 'if') // "must match then" duplicates the real error
    .map((e) => {
      const extra = e.params.additionalProperty ? ` "${String(e.params.additionalProperty)}"` : '';
      return `schema ${e.instancePath || '/'} ${e.message}${extra}`;
    });
const validateLesson = ajv.compile(readSchema('schema.json'));
const validateAppAudio = ajv.compile(readSchema('app-audio.schema.json'));

const { days, checkpoints, appAudio, stray } = loadContent();
for (const f of stray) warnings.push(`${f}: not a recognised content file (ignored)`);

// 1. Schema
for (const { file, data } of [...days, ...checkpoints]) {
  if (!validateLesson(data)) {
    for (const m of describe(validateLesson.errors)) err(file, m);
  }
}
if (!validateAppAudio(appAudio.data)) {
  for (const m of describe(validateAppAudio.errors)) err(appAudio.file, m);
}

// 2. Cross-file rules
const vocabDefinedOn = new Map<string, number>(); // id → day
const exerciseIds = new Set<string>();

function checkExercise(file: string, ex: Exercise, idPrefix: string, knownVocab: (id: string) => boolean) {
  if (!ex.id.startsWith(idPrefix + '-')) err(file, `${ex.id}: id must start with ${idPrefix}-`);
  if (exerciseIds.has(ex.id)) err(file, `${ex.id}: duplicate exercise id`);
  exerciseIds.add(ex.id);
  for (const v of ex.vocab ?? []) if (!knownVocab(v)) err(file, `${ex.id}: unknown or not-yet-introduced vocab "${v}"`);

  switch (ex.type) {
    case 'listen-choose':
      if (ex.answer >= ex.options.length) err(file, `${ex.id}: answer index out of range`);
      if ((ex.optionsLang ?? 'es') === 'es' && ex.options[ex.answer] !== ex.audio)
        warnings.push(`${file}: ${ex.id}: correct option "${ex.options[ex.answer]}" differs from audio "${ex.audio}"`);
      break;
    case 'fill-blank': {
      const answer = fillBlankAnswer(ex.es);
      if (ex.options && !ex.options.includes(answer)) err(file, `${ex.id}: options must include the answer "${answer}"`);
      break;
    }
    case 'build-sentence': {
      const tiles = ex.es.split(/\s+/);
      for (const d of ex.distractors ?? []) if (tiles.includes(d)) err(file, `${ex.id}: distractor "${d}" is also in the sentence`);
      break;
    }
    default:
      break;
  }
}

for (const { file, data } of [...days].sort((a, b) => a.data.day - b.data.day)) {
  if (typeof data.day !== 'number') continue; // schema already failed
  const expected = `day-${String(data.day).padStart(3, '0')}.json`;
  if (file !== expected) err(file, `file name should be ${expected}`);
  const lvl = levelForDay(data.day);
  if (lvl && lvl.level !== data.level) err(file, `day ${data.day} belongs to level ${lvl.level}, not ${data.level}`);

  for (const v of data.vocab ?? []) {
    const prev = vocabDefinedOn.get(v.id);
    if (prev !== undefined) err(file, `vocab id "${v.id}" already introduced on day ${prev}`);
    else vocabDefinedOn.set(v.id, data.day);
  }
  const prefix = `d${String(data.day).padStart(3, '0')}`;
  for (const ex of data.exercises ?? []) {
    checkExercise(file, ex, prefix, (id) => (vocabDefinedOn.get(id) ?? Infinity) <= data.day);
  }
}

for (const { file, data } of checkpoints) {
  if (data.checkpoint !== data.level) err(file, 'checkpoint must equal level');
  if (file !== `checkpoint-${data.checkpoint}.json`) err(file, `file name should be checkpoint-${data.checkpoint}.json`);
  const lastDay = LEVELS.find((l) => l.level === data.level)?.lastDay ?? 0;
  for (const ex of data.exercises ?? []) {
    checkExercise(file, ex, `c${data.checkpoint}`, (id) => (vocabDefinedOn.get(id) ?? Infinity) <= lastDay);
  }
}

// 3. Audio coverage
const keys = uniqueKeys([
  ...days.flatMap((d) => lessonStrings(d.data)),
  ...checkpoints.flatMap((c) => checkpointStrings(c.data)),
  ...appAudioStrings(appAudio.data),
]);
const manifestPath = join(AUDIO_DIR, 'manifest.json');
const manifest: { entries: Record<string, { id: string; slow: boolean }> } = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { entries: {} };
const missing = keys.filter((k) => {
  const e = manifest.entries[k];
  return !e || !existsSync(join(AUDIO_DIR, `${e.id}-f.mp3`)) || !existsSync(join(AUDIO_DIR, `${e.id}-m.mp3`));
});
if (missing.length) {
  const msg = `${missing.length} string(s) without audio — run \`npm run audio\`. First: ${missing.slice(0, 5).map((s) => JSON.stringify(s)).join(', ')}`;
  (strictAudio ? errors : warnings).push(msg);
}

// Report
for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);
console.log(
  `${days.length} days, ${checkpoints.length} checkpoints, ${vocabDefinedOn.size} vocab, ${exerciseIds.size} exercises, ${keys.length} audio strings — ` +
    (errors.length ? `${errors.length} error(s)` : 'OK'),
);
process.exit(errors.length ? 1 : 0);
