"""Shared runtime for every GitHub Actions job.

Public-repo rules (BUILD_PLAN.md section 13), enforced here so each job cannot forget:
  * log() prints step names, counts and pass/fail only. Never a transcript, caption, brand
    text, file name, link or id. scripts/validators/no-content-in-logs.mjs refuses print()
    anywhere else in jobs/.
  * Every call to the Worker is signed: HMAC-SHA256(secret, f"{ts}.{body}") in headers, plus
    the job nonce. The spec is fetched, never passed through GitHub.
  * R2 via the S3-compatible endpoint with the job's own scoped credentials.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

WORK = Path(os.environ.get("JOB_WORK_DIR", "jobs/work"))


def log(step: str, **fields: Any) -> None:
    """The only allowed output. Values are numbers, booleans or short enums."""
    safe: dict[str, Any] = {}
    for k, v in fields.items():
        if isinstance(v, (int, float, bool)) or v is None:
            safe[k] = v
        elif isinstance(v, str) and len(v) <= 40 and " " not in v:
            safe[k] = v
        else:
            safe[k] = "[redacted]"
    sys.stdout.write(json.dumps({"step": step, **safe}) + "\n")
    sys.stdout.flush()


@dataclass
class Job:
    id: str
    nonce: str
    worker_url: str
    secret: str
    run_id: str

    @classmethod
    def from_env(cls) -> "Job":
        missing = [k for k in ("JOB_ID", "JOB_NONCE", "WORKER_URL", "JOB_SHARED_SECRET") if not os.environ.get(k)]
        if missing:
            log("job.env.missing", count=len(missing))
            sys.exit(2)
        return cls(
            id=os.environ["JOB_ID"],
            nonce=os.environ["JOB_NONCE"],
            worker_url=os.environ["WORKER_URL"].rstrip("/"),
            secret=os.environ["JOB_SHARED_SECRET"],
            run_id=os.environ.get("RUN_ID", ""),
        )

    def _headers(self, body: str) -> dict[str, str]:
        ts = str(int(time.time()))
        sig = hmac.new(self.secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
        return {
            "Content-Type": "application/json",
            "X-Job-Timestamp": ts,
            "X-Job-Signature": sig,
            "X-Job-Nonce": self.nonce,
            "X-Job-Run-Id": self.run_id,
            "User-Agent": "sheila-creator-dashboard-job",
        }

    def _call(self, method: str, path: str, body: str | None) -> Any:
        url = f"{self.worker_url}/api/jobs/{self.id}{path}"
        req = urllib.request.Request(url, method=method, data=body.encode() if body else None, headers=self._headers(body if body is not None else f"spec:{self.id}"))
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=60) as res:
                    return json.loads(res.read().decode() or "{}")
            except urllib.error.HTTPError as e:
                if e.code in (401, 404, 422):
                    log("worker.call.rejected", status=e.code)
                    raise
                log("worker.call.retry", status=e.code, attempt=attempt)
            except (urllib.error.URLError, TimeoutError):
                log("worker.call.retry", attempt=attempt)
            time.sleep(2 ** attempt)
        raise RuntimeError("worker unreachable")

    def spec(self) -> dict[str, Any]:
        return self._call("GET", "/spec", None)

    def progress(self, step: str, done: int, total: int) -> None:
        try:
            self._call("POST", "/progress", json.dumps({"step": step, "done": done, "total": total}))
        except Exception:
            log("progress.skipped")

    def done(self, result: dict[str, Any]) -> None:
        self._call("POST", "/callback", json.dumps({"ok": True, "result": result}))
        log("job.done")

    def fail(self, safe_error: str) -> None:
        try:
            self._call("POST", "/callback", json.dumps({"ok": False, "safe_error": safe_error[:160]}))
        finally:
            log("job.failed")


# ---------- R2 (S3-compatible) ----------

def r2_client():
    import boto3  # imported lazily so a job that only talks to the Worker needs no boto3

    account = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def r2_download(key: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    r2_client().download_file(os.environ["R2_BUCKET"], key, str(dest))
    return dest


def r2_upload(src: Path, key: str, content_type: str) -> None:
    r2_client().upload_file(str(src), os.environ["R2_BUCKET"], key, ExtraArgs={"ContentType": content_type})


def run(main) -> None:
    """Wrap a job's main(job, spec) so every failure reaches the Worker as a safe summary."""
    job = Job.from_env()
    log("job.start")
    try:
        spec = job.spec()
        result = main(job, spec)
        job.done(result)
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        job.fail(f"{type(e).__name__}")
        sys.exit(1)
