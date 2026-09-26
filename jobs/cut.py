"""Cut a dump into vertical clips (BUILD_PLAN.md section 8). OWNED BY: phase 4.

Pipeline per dump (every stage reports progress; logs carry counts only):
  1. download each uploaded video (streamed from R2 through the Worker, signed)
  2. normalize: constant 30 fps, yuv420p, long side <= 1920, 48 kHz stereo audio (silent track
     added when a video has none)
  3. transcribe with faster-whisper (word timestamps, CPU); "none" when it is not installed
  4. pick moments: an OpenRouter free model reads transcript + dump notes + Brand Profile +
     Research Brief and proposes 2-3x the weekly need; a deterministic fallback (silence-based
     segmentation + longest speech runs) runs when there is no key or the model fails
  5. cut with ffmpeg into one of the recipes (talking_head, hook_first, story, montage; Door B:
     recycle = new first 2 seconds, new subtitle style, trimmed dead air, new caption)
  6. 9:16: MediaPipe face centre when it installed in time, else black-bar removal
     (cropdetect) + centre crop; word-level subtitles burned from an ASS file (soft
     subtitles when this ffmpeg has no libass); loudness to -14 LUFS; cover frame
  7. caption, hashtags, hook + alternative hook; score 0..1 from speech density, hook
     strength and length fit
  8. upload clips/<dump_id>/<clip_id>.mp4 and .jpg, then call back with the clip list

The result shape is checked by the Worker (worker/jobs/cut.ts parseCutResult) and pinned by
tests/unit/cut-result.test.ts against tests/unit/fixtures/cut-result.sample.json, which
jobs/selftest_cut.py regenerates from a real local run.
"""
from __future__ import annotations

import json
import math
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import WORK, Job, download_input, json_object_in, log, openrouter_content, run, upload_output  # noqa: E402

OUT_W, OUT_H = 1080, 1920
FPS = 30
RECIPE_ORDER = ["talking_head", "hook_first", "story", "montage"]
DEFAULT_RECIPES = {
    "talking_head": {"minS": 20, "maxS": 45},
    "hook_first": {"minS": 15, "maxS": 60},
    "story": {"minS": 45, "maxS": 90},
    "montage": {"minS": 15, "maxS": 45},
    "recycle": {"minS": 15, "maxS": 90},
}
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openrouter/free")
ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
GOLD_ASS = "&H006DB5D7"  # #d7b56d as ASS &HAABBGGRR
ESPRESSO_ASS = "&H00131721"  # #211713


class NoUsableMoments(Exception):
    """Nothing in the dump could become a clip (too short, silent and empty)."""


# ---------------------------------------------------------------- small helpers

def new_clip_id() -> str:
    return "clp_" + "".join(secrets.choice(ALPHABET) for _ in range(16))


def sh(args: list[str], cwd: Path | None = None, timeout: int = 1800) -> subprocess.CompletedProcess:
    """Run a tool quietly. Output is captured, never printed (it can contain paths)."""
    return subprocess.run(args, cwd=str(cwd) if cwd else None, capture_output=True, text=True, timeout=timeout, check=True)


def ffmpeg(args: list[str], cwd: Path | None = None, timeout: int = 1800) -> subprocess.CompletedProcess:
    return sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *args], cwd=cwd, timeout=timeout)


def probe(path: Path) -> dict[str, Any]:
    out = sh(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)]).stdout
    data = json.loads(out or "{}")
    v = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    a = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
    dur = float(data.get("format", {}).get("duration") or (v or {}).get("duration") or 0)
    w, h = int((v or {}).get("width") or 0), int((v or {}).get("height") or 0)
    rot = 0
    for sd in (v or {}).get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(sd["rotation"])
    if abs(rot) in (90, 270):
        w, h = h, w
    return {"duration": dur, "width": w, "height": h, "has_audio": a is not None, "has_video": v is not None}


_FILTERS: set[str] | None = None


def ffmpeg_has_filter(name: str) -> bool:
    global _FILTERS
    if _FILTERS is None:
        out = sh(["ffmpeg", "-hide_banner", "-filters"]).stdout
        _FILTERS = {parts[1] for parts in (line.split() for line in out.splitlines()) if len(parts) >= 3}
    return name in _FILTERS


def even(n: float) -> int:
    return max(2, int(n) // 2 * 2)


# ---------------------------------------------------------------- heavy tools

def ensure_heavy() -> dict[str, bool]:
    """With JOB_HEAVY=1 (set by job-cut.yml) install faster-whisper and, if it installs within a
    minute, MediaPipe. Locally nothing is installed; whatever is importable is used."""
    if os.environ.get("JOB_HEAVY") == "1":
        pip = [sys.executable, "-m", "pip", "install", "-q", "--disable-pip-version-check"]
        try:
            sh([*pip, "faster-whisper>=1.0,<2"], timeout=900)
            log("heavy.whisper", ok=True)
        except Exception:  # noqa: BLE001
            log("heavy.whisper", ok=False)
        try:
            sh([*pip, "mediapipe>=0.10,<0.11"], timeout=60)
            log("heavy.mediapipe", ok=True)
        except Exception:  # noqa: BLE001
            log("heavy.mediapipe", ok=False)
    return {"whisper": _importable("faster_whisper"), "mediapipe": _importable("mediapipe") and _importable("cv2")}


def _importable(mod: str) -> bool:
    try:
        __import__(mod)
        return True
    except Exception:  # noqa: BLE001
        return False


# ---------------------------------------------------------------- media stages

def normalize(src: Path, dst: Path) -> dict[str, Any]:
    info = probe(src)
    if not info["has_video"] or info["duration"] <= 0:
        raise NoUsableMoments("no video stream")
    scale = "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'"
    args = ["-i", str(src)]
    if not info["has_audio"]:
        args += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest"]
    args += [
        "-map", "0:v:0", "-map", "0:a:0" if info["has_audio"] else "1:a:0",
        "-vf", f"{scale},fps={FPS},format=yuv420p,setsar=1",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k",
        "-movflags", "+faststart", str(dst),
    ]
    ffmpeg(args)
    out = probe(dst)
    out["had_audio"] = info["has_audio"]
    return out


def extract_wav(src: Path, dst: Path) -> None:
    ffmpeg(["-i", str(src), "-vn", "-ac", "1", "-ar", "16000", str(dst)])


def speech_runs(wav: Path, duration: float, noise_db: int = -35, min_silence: float = 0.4) -> list[tuple[float, float]]:
    """Non-silent stretches from ffmpeg silencedetect: the deterministic picker's raw material."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-i", str(wav), "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}", "-f", "null", "-"],
        capture_output=True, text=True, timeout=900,
    )
    silences: list[tuple[float, float]] = []
    start: float | None = None
    for line in proc.stderr.splitlines():
        m = re.search(r"silence_start: (-?[\d.]+)", line)
        if m:
            start = max(0.0, float(m.group(1)))
        m = re.search(r"silence_end: ([\d.]+)", line)
        if m and start is not None:
            silences.append((start, float(m.group(1))))
            start = None
    if start is not None:
        silences.append((start, duration))
    runs: list[tuple[float, float]] = []
    t = 0.0
    for s, e in silences:
        if s - t >= 0.3:
            runs.append((round(t, 2), round(s, 2)))
        t = e
    if duration - t >= 0.3:
        runs.append((round(t, 2), round(duration, 2)))
    return runs


@dataclass
class Word:
    start: float
    end: float
    text: str


@dataclass
class Transcript:
    words: list[Word] = field(default_factory=list)
    segments: list[tuple[float, float, str]] = field(default_factory=list)
    engine: str = "none"

    def words_in(self, s: float, e: float) -> list[Word]:
        return [w for w in self.words if w.start >= s - 0.05 and w.end <= e + 0.05]

    def text_in(self, s: float, e: float) -> str:
        return " ".join(w.text for w in self.words_in(s, e)).strip()


_WHISPER = None


def transcribe(wav: Path, available: bool) -> Transcript:
    global _WHISPER
    if not available:
        return Transcript(engine="none")
    try:
        from faster_whisper import WhisperModel  # type: ignore

        if _WHISPER is None:
            _WHISPER = WhisperModel(os.environ.get("WHISPER_MODEL", "base"), device="cpu", compute_type="int8")
        segs, _info = _WHISPER.transcribe(str(wav), word_timestamps=True, vad_filter=True)
        t = Transcript(engine="faster-whisper")
        for seg in segs:
            t.segments.append((float(seg.start), float(seg.end), seg.text.strip()))
            for w in seg.words or []:
                txt = w.word.strip()
                if txt:
                    t.words.append(Word(float(w.start), float(w.end), txt))
        return t
    except Exception:  # noqa: BLE001
        log("transcribe.failed")
        return Transcript(engine="none")


# ---------------------------------------------------------------- moment picking

@dataclass
class Moment:
    asset_id: str
    recipe: str
    start: float
    end: float
    parts: list[tuple[float, float]]
    hook: str = ""
    hook_alt: str = ""
    caption: str = ""
    hashtags: list[str] = field(default_factory=list)
    hook_strength: float | None = None


def coverage(runs: list[tuple[float, float]], s: float, e: float) -> float:
    if e <= s:
        return 0.0
    got = sum(max(0.0, min(e, b) - max(s, a)) for a, b in runs)
    return got / (e - s)


def snap_end(runs: list[tuple[float, float]], start: float, lo: float, hi: float, target: float, duration: float) -> float:
    """End the cut at a pause (the end of a speech run) near the target length."""
    hi = min(hi, duration)
    cands = [b for _a, b in runs if lo <= b <= hi]
    if cands:
        return min(cands, key=lambda b: abs(b - target))
    return max(lo, min(target, hi))


def windows(runs: list[tuple[float, float]], duration: float, min_s: float, max_s: float, count: int, prefer_speech: bool = True) -> list[tuple[float, float, float]]:
    """Best non-overlapping windows (start, end, speech coverage), highest coverage first."""
    if count <= 0 or duration < 3:
        return []
    if duration < min_s:
        return [(0.0, round(duration, 2), coverage(runs, 0, duration))]
    target = (min_s + max_s) / 2
    starts = sorted({round(a, 2) for a, _b in runs} | {float(x) for x in range(0, int(max(1, duration - min_s)) + 1, 5)})
    cands = []
    for st in starts:
        if st + min_s > duration:
            continue
        en = snap_end(runs, st, st + min_s, st + max_s, st + target, duration)
        if en - st < min_s - 0.01:
            continue
        cov = coverage(runs, st, en)
        cands.append((st, round(en, 2), cov))
    cands.sort(key=lambda w: (w[2] if prefer_speech else 1 - w[2]), reverse=True)
    chosen: list[tuple[float, float, float]] = []
    for w in cands:
        if all(min(w[1], c[1]) - max(w[0], c[0]) < 0.3 * (w[1] - w[0]) for c in chosen):
            chosen.append(w)
        if len(chosen) >= count:
            break
    return chosen


def best_line(runs: list[tuple[float, float]], transcript: Transcript, s: float, e: float, max_len: float, skip_first: float = 0.0) -> tuple[float, float] | None:
    """The strongest short line inside [s, e): most words (or longest speech run) not at the very start."""
    best = None
    best_score = -1.0
    for a, b in runs:
        a2, b2 = max(a, s + skip_first), min(b, e)
        if b2 - a2 < 0.8:
            continue
        b2 = min(b2, a2 + max_len)
        score = len(transcript.words_in(a2, b2)) + (b2 - a2) * 0.1
        if score > best_score:
            best, best_score = (round(a2, 2), round(b2, 2)), score
    return best


def first_sentence(text: str, max_words: int = 9) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    sent = re.split(r"(?<=[.!?])\s", text)[0]
    words = sent.split()
    out = " ".join(words[:max_words])
    return out.rstrip(",;:") + ("…" if len(words) > max_words else "")


def brief_hooks(brief: Any) -> list[str]:
    try:
        return [first_sentence(str(c.get("text", "")), 9) for c in (brief or {}).get("hooks", []) if c.get("text")]
    except Exception:  # noqa: BLE001
        return []


def theme_tags(profile: dict[str, str] | None, brief: Any) -> list[str]:
    raw: list[str] = []
    if profile:
        raw += re.split(r"[\n,;•·/]+", profile.get("themes", ""))
    try:
        raw += [str(t.get("title", "")) for t in (brief or {}).get("themes", [])]
    except Exception:  # noqa: BLE001
        pass
    tags: list[str] = []
    for r in raw:
        words = re.findall(r"[A-Za-z0-9]+", r)[:3]
        if not words:
            continue
        tag = "#" + "".join(w.lower() for w in words)
        if 3 <= len(tag) <= 30 and tag not in tags:
            tags.append(tag)
    return tags[:5] or ["#creator"]


def cta_line(profile: dict[str, str] | None) -> str:
    if not profile:
        return ""
    lines = [l.strip(" -•\t") for l in profile.get("ctas", "").splitlines() if l.strip(" -•\t")]
    return lines[0][:80] if lines else ""


GENERIC_HOOKS = {
    "talking_head": ["Real talk for a second", "Here's what nobody tells you"],
    "hook_first": ["Wait for this part", "You need to hear this"],
    "story": ["Story time", "So this happened"],
    "montage": ["A little look at my week", "Come along with me"],
    "recycle": ["Round two, because you asked", "Still one of my favorites"],
}


def fill_copy(m: Moment, transcript: Transcript, spec: dict[str, Any], i: int) -> None:
    """Deterministic hook / alt hook / caption / hashtags when the model did not provide them."""
    hooks = brief_hooks(spec.get("brief"))
    said = first_sentence(transcript.text_in(m.start, m.end))
    generic = GENERIC_HOOKS.get(m.recipe, GENERIC_HOOKS["talking_head"])
    if not m.hook:
        m.hook = said or (hooks[i % len(hooks)] if hooks else generic[0])
    if not m.hook_alt:
        alt = hooks[(i + 1) % len(hooks)] if hooks else generic[1]
        m.hook_alt = alt if alt != m.hook else generic[1]
    if not m.caption:
        cta = cta_line(spec.get("brand_profile"))
        base = first_sentence(transcript.text_in(m.start, m.end), 25) or m.hook
        base = base.rstrip("….!?,;: ")
        base = base[:1].upper() + base[1:]
        if m.recipe == "recycle":
            base = f"{base} (a favorite, back again)"
        m.caption = f"{base}. {cta}" if cta else f"{base}."
    if not m.hashtags:
        m.hashtags = theme_tags(spec.get("brand_profile"), spec.get("brief"))


def hook_strength(text: str) -> float:
    t = text.lower()
    s = 0.5
    if "?" in t:
        s += 0.1
    if re.search(r"\d", t):
        s += 0.1
    if re.search(r"\b(you|your)\b", t):
        s += 0.1
    if 0 < len(t.split()) <= 8:
        s += 0.1
    return min(0.9, s)


def fallback_moments(asset: dict[str, Any], duration: float, runs: list[tuple[float, float]], transcript: Transcript, recipes: dict[str, Any], quota: int, door: str) -> list[Moment]:
    """Silence-based segmentation + longest speech runs. Always yields something for footage >= 3 s."""
    aid = asset["id"]
    out: list[Moment] = []
    if door == "recycle":
        b = recipes["recycle"]
        body_s = runs[0][0] if runs else 0.0
        body_e = runs[-1][1] if runs else duration
        if body_e - body_s < 3:
            body_s, body_e = 0.0, duration
        wins = [(body_s, body_e, 1.0)] if body_e - body_s <= b["maxS"] - 2 else windows(runs, duration, 45, b["maxS"] - 2, max(1, quota))
        for s, e, _c in wins[: max(1, quota)]:
            line = best_line(runs, transcript, s, e, 2.0, skip_first=3.0)
            parts = [line, (s, e)] if line and (e - s) > 5 else [(s, e)]
            out.append(Moment(aid, "recycle", round(s, 2), round(e, 2), parts))
        return out

    speechy = coverage(runs, 0, duration) >= 0.35
    order = RECIPE_ORDER if speechy else ["montage", "talking_head", "hook_first", "story"]
    per = max(1, math.ceil(quota / len(order)))
    for r in order:
        if len(out) >= quota:
            break
        b = recipes[r]
        max_s = b["maxS"] - 3 if r == "hook_first" else b["maxS"]
        for s, e, _c in windows(runs, duration, b["minS"], max_s, per, prefer_speech=(r != "montage")):
            parts = [(s, e)]
            if r == "hook_first":
                line = best_line(runs, transcript, s, e, 3.0, skip_first=2.0)
                if not line:
                    continue
                parts = [line, (s, e)]
            out.append(Moment(aid, r, round(s, 2), round(e, 2), parts))
            if len(out) >= quota:
                break
    if not out and duration >= 3:
        out.append(Moment(aid, "montage", 0.0, round(min(duration, recipes["montage"]["maxS"]), 2), [(0.0, round(min(duration, recipes["montage"]["maxS"]), 2))]))
    return out


def llm_moments(asset: dict[str, Any], duration: float, transcript: Transcript, spec: dict[str, Any], quota: int, runs: list[tuple[float, float]]) -> list[Moment] | None:
    """Ask the free OpenRouter model for moments. None means "use the fallback"."""
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key or not transcript.segments:
        return None
    recipes = spec["recipes"]
    door = spec["door"]
    lines = "\n".join(f"[{s:.1f}-{e:.1f}] {t}" for s, e, t in transcript.segments)[:24000]
    allowed = ["recycle"] if door == "recycle" else RECIPE_ORDER
    system = (
        "You pick short vertical-video moments for one creator. Follow her Brand Profile exactly; never pick anything on her "
        "off-limits list. Answer with JSON only: {\"moments\":[{\"start\":s,\"end\":s,\"recipe\":r,\"hook\":str,\"hook_alt\":str,"
        "\"caption\":str,\"hashtags\":[str],\"hook_strength\":0..1}]}. hook and hook_alt are on-screen text, max 8 words each. "
        "caption max 150 characters in her voice with one call to action. 3-5 hashtags."
    )
    user = json.dumps(
        {
            "recipes": {r: recipes[r] for r in allowed},
            "how_many": quota,
            "video_seconds": round(duration, 1),
            "dump_notes": spec.get("notes", ""),
            "file_note": asset.get("file_note") or "",
            "brand_profile": spec.get("brand_profile") or {},
            "research_brief": {k: (spec.get("brief") or {}).get(k) for k in ("hooks", "cut_styles", "themes")},
            "transcript": lines,
        }
    )
    payload = {"model": OPENROUTER_MODEL, "max_tokens": 2500, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    for attempt in range(2):
        try:
            text, _ = openrouter_content(key, payload, timeout=120, usable=json_object_in)
            m = re.search(r"\{.*\}", text, re.S)
            items = json.loads(m.group(0) if m else text).get("moments", [])
            out: list[Moment] = []
            for it in items:
                r = str(it.get("recipe", ""))
                if r not in allowed:
                    continue
                b = recipes[r]
                s = max(0.0, float(it.get("start", 0)))
                e = min(duration, float(it.get("end", 0)))
                max_s = b["maxS"] - 3 if r == "hook_first" else b["maxS"]
                if e - s > max_s:
                    e = s + max_s
                if e - s < min(b["minS"], duration) - 1 or e - s < 3:
                    continue
                parts = [(round(s, 2), round(e, 2))]
                if r in ("hook_first", "recycle"):
                    line = best_line(runs, transcript, s, e, 3.0 if r == "hook_first" else 2.0, skip_first=2.0)
                    if line:
                        parts = [line, parts[0]]
                    elif r == "hook_first":
                        continue
                hs = it.get("hook_strength")
                out.append(
                    Moment(
                        asset["id"], r, round(s, 2), round(e, 2), parts,
                        hook=str(it.get("hook", ""))[:120], hook_alt=str(it.get("hook_alt", ""))[:120], caption=str(it.get("caption", ""))[:300],
                        hashtags=[str(h) for h in (it.get("hashtags") or [])][:6],
                        hook_strength=float(hs) if isinstance(hs, (int, float)) else None,
                    )
                )
                if len(out) >= quota:
                    break
            log("pick.model", ok=True, moments=len(out))
            return out or None
        except Exception:  # noqa: BLE001
            log("pick.model", ok=False, attempt=attempt)
            time.sleep(3)
    return None


# ---------------------------------------------------------------- framing (9:16)

def detect_bars(src: Path, duration: float) -> tuple[int, int, int, int] | None:
    """cropdetect over a few seconds in the middle: the picture area without black bars."""
    ss = max(0.0, duration / 2 - 2)
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-ss", f"{ss:.2f}", "-t", "4", "-i", str(src), "-vf", "cropdetect=24:2:0", "-f", "null", "-"],
        capture_output=True, text=True, timeout=300,
    )
    found = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", proc.stderr)
    if not found:
        return None
    w, h, x, y = map(int, found[-1])
    return (w, h, x, y) if w > 0 and h > 0 else None


FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
FACE_MODEL = Path(os.environ.get("FACE_MODEL_PATH", str(WORK / "blaze_face_short_range.tflite")))
_DETECTOR: Any = None


def face_detector(available: bool) -> Any:
    """MediaPipe Tasks face detector (the legacy mp.solutions API is gone from 0.10.2x+).
    The short-range model suits phone selfie footage. None when anything is missing."""
    global _DETECTOR
    if _DETECTOR is not None or not available:
        return _DETECTOR
    _stage = "import"
    try:
        import mediapipe as mp  # type: ignore
        from mediapipe.tasks.python import BaseOptions, vision  # type: ignore

        _stage = "model"
        if not FACE_MODEL.exists():
            FACE_MODEL.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(FACE_MODEL_URL, timeout=60) as res:
                FACE_MODEL.write_bytes(res.read())
        _stage = "create"
        opts = vision.FaceDetectorOptions(base_options=BaseOptions(model_asset_path=str(FACE_MODEL)), min_detection_confidence=0.5)
        _DETECTOR = (mp, vision.FaceDetector.create_from_options(opts))
    except Exception as e:  # noqa: BLE001
        missing = re.search(r"lib[\w.+-]+\.so[\d.]*", str(e))  # a system library name, never content
        log("face.detector.unavailable", err=type(e).__name__, where=_stage, lib=missing.group(0) if missing else None)
        _DETECTOR = False
    return _DETECTOR


def face_center(src: Path, s: float, e: float, available: bool) -> float | None:
    """Median horizontal face centre (0..1) across the clip, sampled every 0.5 s; None when
    the detector is unavailable or no face is found (then the centre crop is used)."""
    d = face_detector(available)
    if not d:
        return None
    try:
        import cv2  # type: ignore

        mp, det = d
        cap = cv2.VideoCapture(str(src))
        xs: list[float] = []
        t = s
        while t < e and len(xs) < 120:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, frame = cap.read()
            if not ok:
                break
            h, w = frame.shape[:2]
            res = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
            if res.detections:
                bb = max(res.detections, key=lambda x: x.bounding_box.width).bounding_box
                xs.append((bb.origin_x + bb.width / 2) / max(1, w))
            t += 0.5
        cap.release()
        if not xs:
            return None
        xs.sort()
        return min(1.0, max(0.0, xs[len(xs) // 2]))
    except Exception:  # noqa: BLE001
        return None


def crop_filter(width: int, height: int, bars: tuple[int, int, int, int] | None, cx: float | None) -> str:
    bx, by, bw, bh = 0, 0, width, height
    if bars:
        w, h, x, y = bars
        if w >= width * 0.5 and h >= height * 0.5:
            bw, bh, bx, by = w, h, x, y
    cw = min(bw, even(bh * 9 / 16))
    ch = min(bh, even(cw * 16 / 9))
    centre = cx if cx is not None else 0.5
    x = int(min(max(0, bx + centre * bw - cw / 2), bx + bw - cw))
    y = int(by + (bh - ch) / 2)
    return f"crop={even(cw)}:{even(ch)}:{x}:{y},scale={OUT_W}:{OUT_H}:flags=lanczos,setsar=1"


# ---------------------------------------------------------------- subtitles

def ass_time(t: float) -> str:
    t = max(0.0, t)
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def ass_text(s: str) -> str:
    return s.replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ")


def build_ass(words: list[Word], hook: str, style: str, hook_until: float) -> str:
    """Word-level captions: chunks of up to 3 words, the spoken word in gold. The hook sits at the
    top for the first seconds. Door B uses a boxed style so a recycled video looks new."""
    boxed = style == "recycle"
    sub = (
        f"Style: Sub,DejaVu Sans,{84 if boxed else 78},&H00FFFFFF,&H00FFFFFF,{ESPRESSO_ASS if boxed else '&H00000000'},{ESPRESSO_ASS if boxed else '&H64000000'},"
        f"-1,0,0,0,100,100,0,0,{3 if boxed else 1},{12 if boxed else 6},0,{5 if boxed else 2},80,80,{0 if boxed else 430},1"
    )
    hook_style = f"Style: Hook,DejaVu Sans,86,{ESPRESSO_ASS},&H00FFFFFF,{GOLD_ASS},{GOLD_ASS},-1,0,0,0,100,100,0,0,3,18,0,8,70,70,240,1"
    out = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {OUT_W}", f"PlayResY: {OUT_H}", "WrapStyle: 0", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        sub, hook_style, "",
        "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    if hook:
        out.append(f"Dialogue: 1,{ass_time(0)},{ass_time(hook_until)},Hook,,0,0,0,,{ass_text(hook)}")
    chunks = [words[i : i + 3] for i in range(0, len(words), 3)]
    for chunk in chunks:
        for j, w in enumerate(chunk):
            end = chunk[j + 1].start if j + 1 < len(chunk) else w.end
            if end - w.start < 0.05:
                end = w.start + 0.05
            text = " ".join((f"{{\\c{GOLD_ASS}&}}{ass_text(x.text)}{{\\c&H00FFFFFF&}}" if k == j else ass_text(x.text)) for k, x in enumerate(chunk))
            out.append(f"Dialogue: 0,{ass_time(w.start)},{ass_time(end)},Sub,,0,0,0,,{text}")
    return "\n".join(out) + "\n"


def build_srt(words: list[Word], hook: str, hook_until: float) -> str:
    def ts(t: float) -> str:
        ms = int(round(max(0.0, t) * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"

    cues: list[tuple[float, float, str]] = []
    if hook:
        cues.append((0.0, hook_until, hook))
    for i in range(0, len(words), 3):
        ch = words[i : i + 3]
        cues.append((ch[0].start, ch[-1].end, " ".join(w.text for w in ch)))
    return "".join(f"{n}\n{ts(s)} --> {ts(e)}\n{t}\n\n" for n, (s, e, t) in enumerate(cues, 1))


def clip_words(transcript: Transcript, parts: list[tuple[float, float]]) -> list[Word]:
    """Source-time words mapped onto the clip timeline (parts are concatenated in order)."""
    out: list[Word] = []
    offset = 0.0
    for s, e in parts:
        for w in transcript.words_in(s, e):
            out.append(Word(round(w.start - s + offset, 3), round(w.end - s + offset, 3), w.text))
        offset += e - s
    return out


# ---------------------------------------------------------------- render

def render(src: Path, info: dict[str, Any], m: Moment, transcript: Transcript, crop: str, work: Path, clip_id: str) -> tuple[Path, Path, str]:
    """Cut the parts, frame 9:16, burn subtitles, level loudness; then grab the cover frame."""
    out = work / f"{clip_id}.mp4"
    cover = work / f"{clip_id}.jpg"
    words = clip_words(transcript, m.parts)
    hook_until = min(3.0, sum(e - s for s, e in m.parts))
    style = "recycle" if m.recipe == "recycle" else "default"
    args: list[str] = []
    for s, e in m.parts:
        args += ["-ss", f"{s:.3f}", "-t", f"{e - s:.3f}", "-i", str(src.resolve())]
    n = len(m.parts)
    chains = [f"[{i}:v]{crop},fps={FPS}[v{i}];[{i}:a]aresample=48000,aformat=channel_layouts=stereo[a{i}]" for i in range(n)]
    concat = "".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[vc][ac]"
    subs_mode = "none"
    vlast = "[vc]"
    extra_inputs: list[str] = []
    maps_sub: list[str] = []
    if ffmpeg_has_filter("subtitles"):
        (work / f"{clip_id}.ass").write_text(build_ass(words, m.hook, style, hook_until), encoding="utf-8")
        chains.append(concat)
        chains.append(f"[vc]subtitles={clip_id}.ass[vs]")
        vlast = "[vs]"
        subs_mode = "burned" if words else "hook-only"
    else:
        chains.append(concat)
        (work / f"{clip_id}.srt").write_text(build_srt(words, m.hook, hook_until), encoding="utf-8")
        extra_inputs = ["-i", f"{clip_id}.srt"]
        maps_sub = ["-map", f"{n}:s", "-c:s", "mov_text"]
        subs_mode = "soft"
    chains.append("[ac]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[ao]")
    ffmpeg(
        [
            *args,
            *extra_inputs,
            "-filter_complex", ";".join(chains),
            "-map", vlast, "-map", "[ao]", *maps_sub,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", str(FPS),
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
            "-movflags", "+faststart", out.name,
        ],
        cwd=work,
    )
    dur = probe(out)["duration"]
    ffmpeg(["-ss", f"{min(1.0, dur / 3):.2f}", "-i", out.name, "-frames:v", "1", "-q:v", "3", cover.name], cwd=work)
    return out, cover, subs_mode


def score_moment(m: Moment, transcript: Transcript, runs: list[tuple[float, float]], recipes: dict[str, Any]) -> float:
    length = m.end - m.start
    if transcript.words:
        density = min(1.0, len(transcript.words_in(m.start, m.end)) / max(1.0, length) / 2.5)
    else:
        density = coverage(runs, m.start, m.end)
    if m.recipe == "montage":
        density = max(density, 0.5)
    hook = m.hook_strength if m.hook_strength is not None else hook_strength(m.hook)
    b = recipes.get(m.recipe, {"minS": 15, "maxS": 60})
    sweet = (b["minS"] + b["maxS"]) / 2
    fit = max(0.0, 1.0 - abs(length - sweet) / max(1.0, (b["maxS"] - b["minS"])))
    return round(max(0.0, min(1.0, 0.45 * density + 0.35 * hook + 0.2 * fit)), 3)


# ---------------------------------------------------------------- the whole dump

Uploader = Callable[[Path, str, str], None]
Downloader = Callable[[str, Path], Path]
Progress = Callable[[str, int, int], None]


def cut_dump(spec: dict[str, Any], work: Path, download: Downloader, upload: Uploader, progress: Progress, heavy: dict[str, bool]) -> dict[str, Any]:
    work.mkdir(parents=True, exist_ok=True)
    assets = spec.get("assets") or []
    if not assets:
        raise NoUsableMoments("no assets")
    recipes = {**DEFAULT_RECIPES, **(spec.get("recipes") or {})}
    door = spec.get("door", "new")
    prefix = spec["output_prefix"]
    target = int((spec.get("target_clips") or {}).get("max") or 20)
    engine = {"transcript": "none", "picker": "fallback", "crop": "center", "subtitles": "none"}

    # 1-2. download + normalize
    prepared = []
    for i, a in enumerate(assets):
        progress("Getting your videos", i, len(assets))
        raw = download(a["r2_key"], work / f"raw_{i}")
        norm = work / f"norm_{i}.mp4"
        info = normalize(raw, norm)
        raw.unlink(missing_ok=True)
        wav = work / f"audio_{i}.wav"
        extract_wav(norm, wav)
        prepared.append((a, norm, info, wav))
    log("cut.prepared", assets=len(prepared))

    total_dur = sum(p[2]["duration"] for p in prepared) or 1.0
    moments: list[tuple[Moment, Path, dict[str, Any], Transcript, list[tuple[float, float]]]] = []
    for i, (a, norm, info, wav) in enumerate(prepared):
        # 3. transcribe
        progress("Listening", i, len(prepared))
        tr = transcribe(wav, heavy.get("whisper", False))
        if tr.engine != "none":
            engine["transcript"] = tr.engine
        runs = speech_runs(wav, info["duration"])
        # 4. pick
        progress("Finding the best moments", i, len(prepared))
        quota = 2 if door == "recycle" else max(1, round(target * info["duration"] / total_dur))
        picked = llm_moments(a, info["duration"], tr, spec, quota, runs)
        if picked:
            engine["picker"] = "openrouter"
        else:
            picked = fallback_moments(a, info["duration"], runs, tr, recipes, quota, door)
        for j, m in enumerate(picked):
            fill_copy(m, tr, spec, j)
            moments.append((m, norm, info, tr, runs))
    if not moments:
        raise NoUsableMoments("no moments")
    log("cut.picked", moments=len(moments))

    # 5-7. render
    bars_cache: dict[str, Any] = {}
    clips: list[dict[str, Any]] = []
    for k, (m, norm, info, tr, runs) in enumerate(moments):
        progress("Cutting clips", k, len(moments))
        key = str(norm)
        if key not in bars_cache:
            bars_cache[key] = detect_bars(norm, info["duration"])
        cx = face_center(norm, m.start, m.end, heavy.get("mediapipe", False))
        if cx is not None:
            engine["crop"] = "face"
        crop = crop_filter(info["width"], info["height"], bars_cache[key], cx)
        clip_id = new_clip_id()
        try:
            mp4, jpg, subs = render(norm, info, m, tr, crop, work, clip_id)
        except subprocess.CalledProcessError:
            log("cut.render.failed", n=k)
            continue
        engine["subtitles"] = subs if engine["subtitles"] in ("none", "hook-only") else engine["subtitles"]
        allowed = next((a.get("allowed_platforms") for a in assets if a["id"] == m.asset_id), None) or ["tiktok", "instagram", "youtube"]
        clips.append(
            {
                "id": clip_id,
                "asset_id": m.asset_id,
                "start_s": m.start,
                "end_s": m.end,
                "recipe": m.recipe,
                "hook_text": m.hook[:200],
                "hook_alt": (m.hook_alt or None) and m.hook_alt[:200],
                "caption": m.caption[:2200],
                "hashtags": m.hashtags,
                "platforms": allowed,
                "score": score_moment(m, tr, runs, recipes),
                "r2_key": f"{prefix}{clip_id}.mp4",
                "cover_r2_key": f"{prefix}{clip_id}.jpg",
                "_files": (mp4, jpg),
            }
        )
    if not clips:
        raise NoUsableMoments("nothing rendered")

    # 8. upload
    for k, c in enumerate(clips):
        progress("Saving clips", k, len(clips))
        mp4, jpg = c.pop("_files")
        upload(mp4, c["r2_key"], "video/mp4")
        upload(jpg, c["cover_r2_key"], "image/jpeg")
    progress("Saving clips", len(clips), len(clips))
    log("cut.done", clips=len(clips), transcript=engine["transcript"], picker=engine["picker"], crop=engine["crop"], subtitles=engine["subtitles"])
    return {
        "clips": clips,
        "engine": engine,
        "assets": [{"id": a["id"], "duration_s": round(info["duration"], 2)} for a, _n, info, _w in prepared],
        "skipped": [{"asset_id": s["id"], "reason": s["reason"]} for s in spec.get("skipped_assets", [])],
    }


def main(job: Job, spec: dict[str, Any]) -> dict[str, Any]:
    work = WORK / job.id
    heavy = ensure_heavy()
    log("cut.tools", whisper=heavy["whisper"], mediapipe=heavy["mediapipe"], libass=ffmpeg_has_filter("subtitles"))
    try:
        # NoUsableMoments reaches the Worker by its class name; plainFailure() words it for her.
        return cut_dump(spec, work, download_input, upload_output, job.progress, heavy)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    run(main)
