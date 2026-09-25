"""Local self-test for jobs/cut.py: the real ffmpeg pipeline on synthetic footage, no R2, no Worker.

    python3 jobs/selftest_cut.py                  # run and check
    python3 jobs/selftest_cut.py --write-fixture  # also refresh tests/unit/fixtures/cut-result.sample.json
    python3 jobs/selftest_cut.py --keep <dir>     # keep the rendered clips and covers to look at

Two synthetic videos (ffmpeg testsrc2 + tone bursts with pauses, so silence detection has
something to find): a 60 s landscape video with black bars through Door A, and a 40 s portrait
video through Door B (recycle). Checks every clip is 1080x1920, has audio near -14 LUFS, has
a cover, sits inside its recipe's length, that every progress stage was reported, and that the
result has exactly the shape the Worker accepts. Exits non-zero on any failure; prints nothing
but log() lines (public-repo rule).
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cut  # noqa: E402
from common import log  # noqa: E402

FIXTURE = HERE.parent / "tests" / "unit" / "fixtures" / "cut-result.sample.json"
CLIP_KEYS = {"id", "asset_id", "start_s", "end_s", "recipe", "hook_text", "hook_alt", "caption", "hashtags", "platforms", "score", "r2_key", "cover_r2_key"}
STAGES = {"Getting your videos", "Listening", "Finding the best moments", "Cutting clips", "Saving clips"}


class FakeJob:
    """Stands in for common.Job: records progress instead of calling the Worker."""

    def __init__(self) -> None:
        self.id = "job_selftest"
        self.steps: list[tuple[str, int, int]] = []

    def progress(self, step: str, done: int, total: int) -> None:
        self.steps.append((step, done, total))


SPEECH = (
    "Here is the one thing I never skip in the morning. You need to hear this part. "
    "I make coffee, I write three goals, and I go for a short walk. "
    "Nobody tells you how much that walk changes your whole day. "
    "So this happened last week. I skipped it, and everything felt harder. "
    "Try it tomorrow and tell me how it goes."
)


def speech_track(dest: Path) -> bool:
    """A spoken track (macOS say / Linux espeak-ng) so whisper and word subtitles have words."""
    try:
        if shutil.which("say"):
            subprocess.run(["say", "-o", str(dest.with_suffix(".aiff")), SPEECH], check=True, capture_output=True, timeout=120)
            cut.ffmpeg(["-i", str(dest.with_suffix(".aiff")), "-ar", "48000", str(dest)])
            return True
        if shutil.which("espeak-ng"):
            subprocess.run(["espeak-ng", "-s", "150", "-w", str(dest), SPEECH], check=True, capture_output=True, timeout=120)
            return True
    except Exception:  # noqa: BLE001
        return False
    return False


def make_sample(path: Path, seconds: int, size: str, pad: str | None, speech: Path | None = None) -> None:
    # Without speech: tone for 4.5 s, pause for 1.5 s, so silence detection has runs to find.
    vf = f"pad={pad}:(ow-iw)/2:(oh-ih)/2:black" if pad else "null"
    audio = (
        ["-stream_loop", "-1", "-i", str(speech)]
        if speech
        else ["-f", "lavfi", "-i", f"aevalsrc='0.3*sin(2*PI*330*t)*lt(mod(t\\,6)\\,4.5)':s=48000:d={seconds}"]
    )
    cut.ffmpeg(
        [
            "-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:duration={seconds}",
            *audio,
            "-t", str(seconds), "-vf", vf, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", str(path),
        ]
    )


def loudness(path: Path) -> float | None:
    proc = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True)
    found = re.findall(r"I:\s+(-?[\d.]+) LUFS", proc.stderr)
    return float(found[-1]) if found else None


def spec_for(door: str, dump_id: str, assets: list[dict]) -> dict:
    return {
        "job_id": "job_selftest",
        "type": "cut",
        "dump_id": dump_id,
        "door": door,
        "notes": "selftest",
        "assets": assets,
        "skipped_assets": [],
        "brand_profile": {"themes": "Morning routines\nSmall business life", "ctas": "Follow for more real days"},
        "brief": {"hooks": [{"text": "The one thing I'd never skip."}, {"text": "Nobody tells you this part."}], "themes": [{"title": "Behind the scenes"}]},
        "weekly_caps": {"tiktok": 10, "instagram": 7, "youtube": 5},
        "weekly_need": 10,
        "target_clips": {"min": 4, "max": 6},
        "recipes": cut.DEFAULT_RECIPES,
        "quality_bar": 0.45,
        "output_prefix": f"clips/{dump_id}/",
    }


def check(result: dict, spec: dict, out: Path, problems: list[str]) -> None:
    prefix = spec["output_prefix"]
    asset_ids = {a["id"] for a in spec["assets"]}
    if not result.get("clips"):
        problems.append(f"{spec['door']}: no clips")
    for c in result["clips"]:
        n = len(problems)
        if set(c) != CLIP_KEYS:
            problems.append(f"clip keys {sorted(set(c) ^ CLIP_KEYS)}")
        if not re.fullmatch(r"clp_[a-z0-9]{8,32}", c["id"]):
            problems.append("clip id shape")
        if c["asset_id"] not in asset_ids:
            problems.append("asset id not in spec")
        if not (c["r2_key"].startswith(prefix) and c["r2_key"].endswith(".mp4") and c["cover_r2_key"].endswith(".jpg")):
            problems.append("r2 key shape")
        if not 0 <= c["score"] <= 1:
            problems.append("score range")
        b = cut.DEFAULT_RECIPES[c["recipe"]]
        body = c["end_s"] - c["start_s"]
        if not (3 <= body <= b["maxS"] + 1):
            problems.append(f"{c['recipe']} length {body:.1f}s outside 3..{b['maxS'] + 1}")
        if spec["door"] == "recycle" and c["recipe"] != "recycle":
            problems.append("recycle door made a non-recycle clip")
        if not c["hook_text"]:
            problems.append("empty hook")
        mp4 = out / c["r2_key"]
        jpg = out / c["cover_r2_key"]
        if not mp4.exists() or not jpg.exists() or jpg.stat().st_size == 0:
            problems.append("clip or cover not uploaded")
            continue
        info = cut.probe(mp4)
        if (info["width"], info["height"]) != (cut.OUT_W, cut.OUT_H):
            problems.append(f"not 9:16 1080x1920: {info['width']}x{info['height']}")
        if not info["has_audio"]:
            problems.append("no audio")
        if info["duration"] < body - 0.5:
            problems.append("rendered shorter than the cut")
        if spec["door"] == "recycle" and info["duration"] < body + 1.5 and body > 5:
            problems.append("recycle clip has no new first 2 seconds")
        lufs = loudness(mp4)
        if lufs is None or not -17.5 <= lufs <= -10.5:
            problems.append(f"loudness {lufs} LUFS not near -14")
        if len(problems) == n:
            log("selftest.clip.ok", recipe=c["recipe"], seconds=round(info["duration"], 1))


def main() -> int:
    write_fixture = "--write-fixture" in sys.argv
    tmp = Path(tempfile.mkdtemp(prefix="cut-selftest-"))
    problems: list[str] = []
    try:
        samples = tmp / "samples"
        samples.mkdir()
        speech = samples / "speech.wav"
        has_speech = speech_track(speech)
        make_sample(samples / "wide.mp4", 60, "1280x540", "1280:720", speech if has_speech else None)  # landscape with black bars
        make_sample(samples / "tall.mp4", 40, "720x1280", None)
        out = tmp / "r2"

        def download(key: str, dest: Path) -> Path:
            shutil.copy(samples / key, dest)
            return dest

        def upload(src: Path, key: str, _ct: str) -> None:
            dst = out / key
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dst)

        log("selftest.tools", speech=has_speech, libass=cut.ffmpeg_has_filter("subtitles"))
        heavy = {"whisper": cut._importable("faster_whisper"), "mediapipe": cut._importable("mediapipe") and cut._importable("cv2")}
        all_platforms = ["tiktok", "instagram", "youtube"]
        runs = [
            spec_for("new", "dmp_selftestnew", [{"id": "ast_selftestwide", "r2_key": "wide.mp4", "allowed_platforms": all_platforms, "file_note": None}]),
            spec_for("recycle", "dmp_selftestold", [{"id": "ast_selftesttall", "r2_key": "tall.mp4", "allowed_platforms": ["instagram", "youtube"], "file_note": None}]),
        ]
        fixture_result = None
        for spec in runs:
            job = FakeJob()
            result = cut.cut_dump(spec, tmp / f"work_{spec['door']}", download, upload, job.progress, heavy)
            seen = {s for s, _d, _t in job.steps}
            if seen != STAGES:
                problems.append(f"progress stages missing: {sorted(STAGES - seen)}")
            for key in ("transcript", "picker", "crop", "subtitles"):
                if not result.get("engine", {}).get(key):
                    problems.append(f"engine.{key} not reported")
            if spec["door"] == "new" and has_speech and heavy["whisper"]:
                if result["engine"]["transcript"] != "faster-whisper":
                    problems.append("whisper installed but no transcript")
                if result["engine"]["subtitles"] not in ("burned", "soft"):
                    problems.append("speech but no word subtitles")
            if spec["door"] == "recycle" and any(c["platforms"] != ["instagram", "youtube"] for c in result["clips"]):
                problems.append("recycle clip ignored the allowed platforms")
            check(result, spec, out, problems)
            log("selftest.run", door=spec["door"], clips=len(result["clips"]), transcript=result["engine"]["transcript"], picker=result["engine"]["picker"], crop=result["engine"]["crop"], subtitles=result["engine"]["subtitles"])
            if spec["door"] == "new":
                fixture_result = {"dump_id": spec["dump_id"], "assets": [{"id": a["id"], "r2_key": f"raw/{spec['dump_id']}/{a['id']}", "allowed_platforms": a["allowed_platforms"]} for a in spec["assets"]], "result": result}
        if write_fixture and fixture_result and not problems:
            FIXTURE.parent.mkdir(parents=True, exist_ok=True)
            FIXTURE.write_text(json.dumps(fixture_result, indent=2) + "\n", encoding="utf-8")
            log("selftest.fixture.written")
    finally:
        if "--keep" in sys.argv:  # --keep <dir>: copy the rendered clips out for a look
            shutil.copytree(tmp / "r2", Path(sys.argv[sys.argv.index("--keep") + 1]), dirs_exist_ok=True)
        shutil.rmtree(tmp, ignore_errors=True)
    for p in problems:
        log("selftest.problem", detail=re.sub(r"\s+", "_", p)[:40])
    log("selftest.done", ok=not problems, problems=len(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
