# 100 Días

A 100-day Peninsular Spanish (es-ES) course for complete beginners, as an offline-capable PWA.
Día 1 is **2026-10-01** (local date); Día 100 is 2027-01-08.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (dates, text normalisation, speech scoring)
npm run validate     # content schema + cross-file checks
```

## Content

Lessons live in `content/day-XXX.json` and checkpoints in `content/checkpoint-N.json`.
The format is documented inside `content/schema.json` (editors pick it up via `"$schema"`).
Spanish strings for app screens (e.g. the mic test) live in `content/app-audio.json`.

## Audio

```sh
pip install -r scripts/requirements.txt
npm run audio        # extract strings → edge-tts → public/audio/*.mp3 + manifest.json
```

Every Spanish string gets `es-ES-ElviraNeural` and `es-ES-AlvaroNeural`, at normal speed and −30%.
Lookup is by exact text (accents preserved: *papá* ≠ *papa*). Re-runs only generate new strings.
If the projected total exceeds 400 MB, slow versions are generated only for multi-word strings.
Commit the generated files — CI refuses to deploy if any string lacks audio.

> Windows + Git Bash: prefix `BASE_PATH=/100-dias/` builds with `MSYS_NO_PATHCONV=1`,
> otherwise MSYS rewrites the path.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml` → GitHub Pages at `/<repo>/`.
Routes use hash URLs (`#/mic-test`) so deep links work on Pages.
