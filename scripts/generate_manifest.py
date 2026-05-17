from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHARTS = ROOT / "charts"
MUSIC = ROOT / "music"
OUT = ROOT / "manifest.json"
DIFFICULTIES = ["easy", "normal", "hard", "extreme", "master"]
AUDIO_EXTS = [".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"]


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        print(f"[WARN] skip invalid chart {path}: {exc}")
        return {}


def norm_name(s: str) -> str:
    s = Path(s).stem
    for d in DIFFICULTIES:
        s = re.sub(rf"[. _-]+{re.escape(d)}$", "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip().casefold()


def web_path(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def find_audio(chart: dict, chart_path: Path, audio_files: list[Path]) -> Path | None:
    candidates = []
    if chart.get("audio_path"):
        candidates.append(Path(str(chart["audio_path"]).replace("\\", "/")).name)
    if chart.get("audio_file"):
        candidates.append(Path(str(chart["audio_file"]).replace("\\", "/")).name)
    title = str(chart.get("title") or "")
    if title:
        candidates.extend([title + ext for ext in AUDIO_EXTS])
    candidates.extend([re.sub(rf"[. _-]+({'|'.join(DIFFICULTIES)})$", "", chart_path.stem, flags=re.I) + ext for ext in AUDIO_EXTS])

    by_name = {p.name.casefold(): p for p in audio_files}
    for c in candidates:
        hit = by_name.get(Path(c).name.casefold())
        if hit:
            return hit

    key = norm_name(title or chart_path.stem)
    for p in audio_files:
        if norm_name(p.name) == key:
            return p
    return None


def difficulty_of(chart: dict, path: Path) -> str | None:
    d = str(chart.get("difficulty") or "").lower().strip()
    if d in DIFFICULTIES:
        return d
    stem = path.stem.lower()
    for diff in DIFFICULTIES:
        if stem.endswith("." + diff) or stem.endswith("_" + diff) or stem.endswith("-" + diff):
            return diff
    return None


def main() -> None:
    audio_files = [p for p in MUSIC.rglob("*") if p.suffix.lower() in AUDIO_EXTS]
    chart_files = [p for p in CHARTS.rglob("*.json")]
    songs: dict[str, dict] = {}

    for cp in chart_files:
        chart = read_json(cp)
        if not chart:
            continue
        diff = difficulty_of(chart, cp)
        if not diff:
            print(f"[WARN] cannot determine difficulty: {cp}")
            continue
        audio = find_audio(chart, cp, audio_files)
        if not audio:
            print(f"[WARN] cannot find matching audio for {cp}")
            continue
        title = str(chart.get("title") or audio.stem)
        song_key = str(chart.get("song_id") or hashlib.sha1(web_path(audio).encode("utf-8")).hexdigest()[:12])
        item = songs.setdefault(song_key, {
            "id": song_key,
            "title": title,
            "audio": web_path(audio),
            "bpm": chart.get("tempo_bpm") or chart.get("bpm"),
            "duration": chart.get("duration"),
            "charts": {},
        })
        item["title"] = title or item["title"]
        item["audio"] = web_path(audio)
        item["bpm"] = item.get("bpm") or chart.get("tempo_bpm") or chart.get("bpm")
        item["duration"] = item.get("duration") or chart.get("duration")
        item["charts"][diff] = web_path(cp)

    manifest = {
        "schema_version": 3,
        "game": "Rhythm4G Online",
        "generated_by": "scripts/generate_manifest.py",
        "songs": sorted(songs.values(), key=lambda x: x["title"].casefold()),
    }
    OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} with {len(manifest['songs'])} songs")


if __name__ == "__main__":
    main()
