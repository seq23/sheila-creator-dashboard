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


def install() -> None:
    log("voice.install")
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "--extra-index-url", "https://download.pytorch.org/whl/cpu", CHATTERBOX],
        check=True,
        stdout=subprocess.DEVNULL,
    )


def to_wav(src: Path, dest: Path) -> Path:
    # Browser recordings are webm/ogg/mp4; Chatterbox wants a clean mono WAV.
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "24000", str(dest)], check=True)
    return dest


def main(job: Job, spec: dict[str, Any]) -> dict[str, Any]:
    script = str(spec.get("script") or "").strip()
    if not script:
        raise RuntimeError("empty_script")
    work = WORK / "voice"
    work.mkdir(parents=True, exist_ok=True)

    job.progress("preparing", 0, 4)
    install()
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
