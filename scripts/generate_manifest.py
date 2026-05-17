#!/usr/bin/env python3
"""Generate Rhythm4G Online manifest.json from music/ and charts/.

Usage:
    python scripts/generate_manifest.py

This is needed because browsers and GitHub Pages cannot safely enumerate a
static directory at runtime. Put audio files in music/ and chart JSON files in
charts/, then run this script or let the included GitHub Actions workflow run it
on deploy.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MUSIC_DIR = ROOT / "music"
CHARTS_DIR = ROOT / "charts"
AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"}
DIFFICULTY_ORDER = {"easy": 0, "normal": 1, "hard": 2, "extreme": 3, "master": 4}


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def strip_diff(stem: str) -> str:
    return re.sub(r"\.(easy|normal|hard|extreme|master)$", "", stem, flags=re.I)


def diff_from_name(path: Path) -> str:
    m = re.search(r"\.(easy|normal|hard|extreme|master)\.json$", path.name, flags=re.I)
    return m.group(1).lower() if m else "chart"


def load_chart(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def norm_path(p: str | None) -> str:
    if not p:
        return ""
    return str(p).replace("\\", "/").lstrip("./")


def main() -> None:
    audio_files = sorted([p for p in MUSIC_DIR.glob("**/*") if p.is_file() and p.suffix.lower() in AUDIO_EXTS]) if MUSIC_DIR.exists() else []
    chart_files = sorted([p for p in CHARTS_DIR.glob("**/*.json") if p.is_file()]) if CHARTS_DIR.exists() else []

    audio_by_stem: dict[str, Path] = {p.stem: p for p in audio_files}
    songs: dict[str, dict[str, Any]] = {}

    for chart_path in chart_files:
        chart = load_chart(chart_path)
        chart_stem = strip_diff(chart_path.stem)
        chart_audio = norm_path(chart.get("audio_path") or chart.get("audio_file"))
        audio_path = ""

        if chart_audio:
            # Prefer chart metadata. If it only contains a filename, normalize to music/<file> when present.
            candidate = ROOT / chart_audio
            if candidate.exists():
                audio_path = norm_path(chart_audio)
            else:
                name_candidate = MUSIC_DIR / Path(chart_audio).name
                audio_path = rel(name_candidate) if name_candidate.exists() else norm_path(chart_audio)
        elif chart_stem in audio_by_stem:
            audio_path = rel(audio_by_stem[chart_stem])
        else:
            # Last-resort guess. The app can still show the chart, but loading will fail until audio exists.
            for ext in sorted(AUDIO_EXTS):
                guess = MUSIC_DIR / f"{chart_stem}{ext}"
                if guess.exists():
                    audio_path = rel(guess)
                    break
            if not audio_path:
                audio_path = f"music/{chart_stem}.mp3"

        key = audio_path or chart_stem
        song = songs.setdefault(key, {
            "title": chart.get("title") or chart_stem,
            "audio": audio_path,
            "charts": [],
        })
        if chart.get("title"):
            song["title"] = chart.get("title")
        song["charts"].append({
            "difficulty": chart.get("difficulty") or diff_from_name(chart_path),
            "path": rel(chart_path),
            "bpm": chart.get("tempo_bpm"),
            "notes": len(chart.get("notes", [])) if isinstance(chart.get("notes"), list) else None,
        })

    # Include audio-only files too, so users can see unmatched songs.
    for audio in audio_files:
        key = rel(audio)
        songs.setdefault(key, {
            "title": audio.stem,
            "audio": key,
            "charts": [],
        })

    out_songs = list(songs.values())
    for song in out_songs:
        song["charts"].sort(key=lambda c: (DIFFICULTY_ORDER.get(str(c.get("difficulty", "")).lower(), 99), c.get("path", "")))
    out_songs.sort(key=lambda s: str(s.get("title", "")).casefold())

    manifest = {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "songs": out_songs,
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote manifest.json: {len(out_songs)} songs, {len(chart_files)} charts, {len(audio_files)} audio files")


if __name__ == "__main__":
    main()
