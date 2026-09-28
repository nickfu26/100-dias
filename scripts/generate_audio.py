#!/usr/bin/env python3
"""Pre-generate MP3s for every Spanish string in the course with edge-tts.

Input : scripts/.cache/audio-strings.json  (written by `npm run audio:list`)
Output: public/audio/<id>-<f|m>.mp3        normal speed
        public/audio/<id>-<f|m>-slow.mp3   rate -30%
        public/audio/manifest.json         { entries: { "<exact text>": { id, slow } } }

<id> = first 12 hex chars of sha1(text). Text is used exactly as given (NFC, accents
preserved), so "papá" and "papa" get different files. Re-runs only generate what's missing.

Slow policy (--slow-policy):
  all        slow version for every string
  multiword  slow version only for strings with 2+ words
  auto       (default) all, unless the projected total exceeds --budget-mb (default 400),
             in which case multiword

Usage: npm run audio            (extracts strings, then runs this)
       python scripts/generate_audio.py [--slow-policy auto|all|multiword] [--prune]
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("edge-tts not installed: pip install -r scripts/requirements.txt")

ROOT = Path(__file__).resolve().parent.parent
STRINGS = ROOT / "scripts" / ".cache" / "audio-strings.json"
OUT = ROOT / "public" / "audio"
VOICES = {"f": "es-ES-ElviraNeural", "m": "es-ES-AlvaroNeural"}
SLOW_RATE = "-30%"
SLOW_SIZE_FACTOR = 1 / 0.7  # slow files are ~1.43x longer


def audio_key(text: str) -> str:
    # Must match audioKey() in src/content/audioStrings.ts
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text).strip())


def audio_id(key: str) -> str:
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


def is_multiword(key: str) -> bool:
    return len(re.findall(r"[^\W\d_]+|\d+", key)) >= 2


def path_for(aid: str, voice: str, slow: bool) -> Path:
    return OUT / f"{aid}-{voice}{'-slow' if slow else ''}.mp3"


async def synth(sem: asyncio.Semaphore, text: str, voice: str, rate: str, dest: Path) -> None:
    async with sem:
        tmp = dest.with_suffix(".part")
        for attempt in range(1, 5):
            try:
                await edge_tts.Communicate(text, VOICES[voice], rate=rate).save(str(tmp))
                if tmp.stat().st_size < 500:
                    raise RuntimeError("suspiciously small file")
                tmp.replace(dest)
                return
            except Exception as e:  # network hiccups are common; back off and retry
                if attempt == 4:
                    tmp.unlink(missing_ok=True)
                    raise RuntimeError(f"{dest.name} ({text!r}, {voice}): {e}") from e
                await asyncio.sleep(1.5 * attempt)


async def run_jobs(jobs: list[tuple[str, str, str, Path]], concurrency: int, label: str) -> None:
    if not jobs:
        print(f"{label}: nothing to do")
        return
    sem = asyncio.Semaphore(concurrency)
    done = 0

    async def one(job):
        nonlocal done
        await synth(sem, *job)
        done += 1
        if done % 25 == 0 or done == len(jobs):
            print(f"{label}: {done}/{len(jobs)}")

    results = await asyncio.gather(*(one(j) for j in jobs), return_exceptions=True)
    failures = [r for r in results if isinstance(r, Exception)]
    for f in failures:
        print(f"  ✗ {f}", file=sys.stderr)
    if failures:
        sys.exit(f"{len(failures)} file(s) failed — re-run to retry (finished files are kept).")


def main() -> None:
    # Windows consoles default to cp1252, which cannot print the Spanish text or arrows below.
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--slow-policy", choices=["auto", "all", "multiword"], default="auto")
    ap.add_argument("--budget-mb", type=float, default=400)
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--prune", action="store_true", help="delete MP3s no longer referenced")
    args = ap.parse_args()

    if not STRINGS.exists():
        sys.exit(f"{STRINGS} missing — run `npm run audio:list` first.")
    keys = sorted({audio_key(s) for s in json.loads(STRINGS.read_text("utf-8")) if s.strip()})
    OUT.mkdir(parents=True, exist_ok=True)
    ids = {k: audio_id(k) for k in keys}

    # 1. Normal speed, both voices
    jobs = [
        (k, v, "+0%", path_for(ids[k], v, False))
        for k in keys for v in VOICES if not path_for(ids[k], v, False).exists()
    ]
    asyncio.run(run_jobs(jobs, args.concurrency, "normal"))

    # 2. Decide slow policy from measured normal sizes
    normal_bytes = sum(path_for(ids[k], v, False).stat().st_size for k in keys for v in VOICES)
    projected_mb = normal_bytes * (1 + SLOW_SIZE_FACTOR) / 1e6
    policy = args.slow_policy
    if policy == "auto":
        policy = "all" if projected_mb <= args.budget_mb else "multiword"
    print(f"normal audio {normal_bytes / 1e6:.1f} MB; projected with all-slow {projected_mb:.1f} MB → slow policy: {policy}")
    slow_keys = {k for k in keys if policy == "all" or is_multiword(k)}

    # 3. Slow speed
    jobs = [
        (k, v, SLOW_RATE, path_for(ids[k], v, True))
        for k in sorted(slow_keys) for v in VOICES if not path_for(ids[k], v, True).exists()
    ]
    asyncio.run(run_jobs(jobs, args.concurrency, "slow"))

    # 4. Manifest
    manifest = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "voices": VOICES,
        "slowRate": SLOW_RATE,
        "slowPolicy": policy,
        "entries": {k: {"id": ids[k], "slow": k in slow_keys} for k in keys},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", "utf-8")

    # 5. Prune
    wanted = {path_for(ids[k], v, False).name for k in keys for v in VOICES}
    wanted |= {path_for(ids[k], v, True).name for k in slow_keys for v in VOICES}
    orphans = [p for p in OUT.glob("*.mp3") if p.name not in wanted]
    if args.prune:
        for p in orphans:
            p.unlink()
    elif orphans:
        print(f"{len(orphans)} unreferenced MP3(s); run with --prune to delete.")

    total = sum(p.stat().st_size for p in OUT.glob("*.mp3"))
    print(f"✓ {len(keys)} strings, {len(list(OUT.glob('*.mp3')))} files, {total / 1e6:.1f} MB in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
