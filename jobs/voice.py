"""Chatterbox narration (section 12).

Clones her voice from the consented sample (Chatterbox by Resemble AI, MIT, CPU) and speaks the
script. Chatterbox output carries an inaudible watermark. The prepared voice conditionals are
saved to R2 as the "voice model" so later narrations skip that step; "Delete my voice" in the
dashboard removes both the sample and this file.

Chatterbox and torch are heavy, so they are installed here, inside the job, not in
requirements.txt (the light jobs stay fast). Logs: step names and counts only.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Any

from common import WORK, Job, download_input, log, run, upload_output

CHATTERBOX = "chatterbox-tts>=0.1.2,<0.2"  # speed and quality on the Actions CPU runner: not yet proven
# Chatterbox watermarks every file with resemble-perth, which imports pkg_resources. Setuptools
# stopped shipping pkg_resources after 80 and the runner's Python has none, so perth quietly set
# its watermarker to None and the model load died with "TypeError: 'NoneType' object is not
# callable" (staging run 36208466035, 26 Sep 2026). Pin a setuptools that still has it.
SETUPTOOLS = "setuptools<81"


def install() -> None:
    log("voice.install")
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "--extra-index-url", "https://download.pytorch.org/whl/cpu", CHATTERBOX, SETUPTOOLS],
        check=True,
        stdout=subprocess.DEVNULL,
    )


def require_watermarker() -> None:
    """Every narration carries the inaudible watermark (BUILD_PLAN section 12). If perth could not
    load its watermarker, stop with a named reason instead of a bare TypeError inside Chatterbox."""
    import perth  # noqa: E402  (installed with chatterbox)

    if getattr(perth, "PerthImplicitWatermarker", None) is None:
        raise RuntimeError("watermarker_unavailable: resemble-perth could not load (pkg_resources missing?)")


def to_wav(src: Path, dest: Path) -> Path:
    # Browser recordings are webm/ogg/mp4; Chatterbox wants a clean mono WAV.
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "24000", str(dest)], check=True)
    return dest


def has_audio(path: Path) -> bool:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return bool(out.stdout.strip())


def mix_command(clip: Path, voice: Path, out: Path, clip_has_audio: bool) -> list[str]:
    """Her voice over on top, the clip's own sound at a quarter underneath; the video stream is
    copied untouched and the result is exactly as long as the clip."""
    if clip_has_audio:
        graph = "[0:a]volume=0.25[bg];[1:a]apad[vo];[bg][vo]amix=inputs=2:duration=first:normalize=0[a]"
        tail = []
    else:
        graph = "[1:a]apad[a]"
        tail = ["-shortest"]
    return ["ffmpeg", "-y", "-loglevel", "error", "-i", str(clip), "-i", str(voice), "-filter_complex", graph, "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", *tail, str(out)]


def mix(job: Job, spec: dict[str, Any]) -> dict[str, Any]:
    """Attach: mix the finished voice over into the clip. ffmpeg only, no model, about a minute."""
    work = WORK / "mix"
    work.mkdir(parents=True, exist_ok=True)
    job.progress("adding your voice over", 0, 2)
    clip = download_input(str(spec["clip_key"]), work / "clip.mp4")
    voice_key = str(spec["narration_key"])
    voice = download_input(voice_key, work / ("voice" + Path(voice_key).suffix))
    out = work / "voiced.mp4"
    with_sound = has_audio(clip)
    subprocess.run(mix_command(clip, voice, out, with_sound), check=True)
    key = str(spec["output_key"])
    job.progress("adding your voice over", 1, 2)
    upload_output(out, key, "video/mp4")
    log("voice.mix.done", clip_audio=with_sound, bytes=out.stat().st_size)
    return {"mode": "mix", "r2_key": key, "bytes": out.stat().st_size}


def main(job: Job, spec: dict[str, Any]) -> dict[str, Any]:
    if spec.get("mode") == "mix":
        return mix(job, spec)
    script = str(spec.get("script") or "").strip()
    if not script:
        raise RuntimeError("empty_script")
    work = WORK / "voice"
    work.mkdir(parents=True, exist_ok=True)

    job.progress("preparing", 0, 4)
    install()
    require_watermarker()
    import torch  # noqa: E402  (installed above)
    import torchaudio  # noqa: E402
    from chatterbox.tts import ChatterboxTTS  # noqa: E402

    model = ChatterboxTTS.from_pretrained(device="cpu")
    job.progress("voice", 1, 4)

    conds_path = work / "conds.pt"
    model_key = str(spec["model_key"])
    loaded = False
    if spec.get("model_exists"):
        try:
            download_input(model_key, conds_path)
            from chatterbox.tts import Conditionals  # noqa: E402

            model.conds = Conditionals.load(conds_path, map_location="cpu")
            loaded = True
        except Exception:  # noqa: BLE001  a stale or missing model is rebuilt from the sample
            log("voice.model.rebuild")
    if not loaded:
        raw = download_input(str(spec["sample_key"]), work / "sample.bin")
        sample = to_wav(raw, work / "sample.wav")
        model.prepare_conditionals(str(sample))
        model.conds.save(conds_path)
        upload_output(conds_path, model_key, "application/octet-stream")
    log("voice.ready", reused=loaded)

    job.progress("speaking", 2, 4)
    # Long scripts are spoken sentence by sentence so the CPU run stays steady.
    parts = [p.strip() for p in script.replace("\n", " ").split(". ") if p.strip()]
    chunks: list[Any] = []
    for i, p in enumerate(parts):
        chunks.append(model.generate(p if p.endswith((".", "!", "?")) else p + "."))
        job.progress("speaking", 2, 4)
        log("voice.sentence", n=i + 1, of=len(parts))
    wav = torch.cat(chunks, dim=-1)
    out_wav = work / "narration.wav"
    torchaudio.save(str(out_wav), wav, model.sr)
    seconds = wav.shape[-1] / model.sr

    job.progress("saving", 3, 4)
    out_mp3 = work / "narration.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(out_wav), "-codec:a", "libmp3lame", "-q:a", "3", str(out_mp3)], check=True)
    key = str(spec["output_key"])
    upload_output(out_mp3, key, "audio/mpeg")
    log("voice.done", seconds=round(seconds, 1), bytes=out_mp3.stat().st_size)
    return {"r2_key": key, "duration_s": round(seconds, 1), "bytes": out_mp3.stat().st_size, "model_key": model_key}


if __name__ == "__main__":
    run(main)
