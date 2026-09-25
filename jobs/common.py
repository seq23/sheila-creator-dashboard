"""Shared runtime for every GitHub Actions job.

Public-repo rules (BUILD_PLAN.md section 13), enforced here so each job cannot forget:
  * log() prints step names, counts and pass/fail only. Never a transcript, caption, brand
    text, file name, link or id. scripts/validators/no-content-in-logs.mjs refuses print()
    anywhere else in jobs/.
  * Every call to the Worker is signed: HMAC-SHA256(secret, f"{ts}.{body}") in headers, plus
    the job nonce. The spec is fetched, never passed through GitHub.
  * Storage only through the Worker: download_input() streams a file with a signed GET,
    upload_output() writes one with the signed chunked upload. A job holds no storage keys;
    the Worker decides which keys each job type may read and write (worker/lib/jobStorage.ts).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.parse
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

    def _headers(self, signed: str, content_type: str = "application/json") -> dict[str, str]:
        ts = str(int(time.time()))
        sig = hmac.new(self.secret.encode(), f"{ts}.{signed}".encode(), hashlib.sha256).hexdigest()
        return {
            "Content-Type": content_type,
            "X-Job-Timestamp": ts,
            "X-Job-Signature": sig,
            "X-Job-Nonce": self.nonce,
            "X-Job-Run-Id": self.run_id,
            "User-Agent": "sheila-creator-dashboard-job",
        }

    def _url(self, path: str) -> str:
        return f"{self.worker_url}/api/jobs/{self.id}{path}"

    def _signed_line(self, method: str, url: str) -> str:
        """What the Worker verifies for a request with no JSON body: the path + query as sent."""
        u = urllib.parse.urlsplit(url)
        line = u.path + (f"?{u.query}" if u.query else "")
        return line if method == "GET" else f"{method} {line}"

    def _call(self, method: str, path: str, body: str | None) -> Any:
        url = self._url(path)
        for attempt in range(4):
            # Signed per attempt: a retry after a long back-off still carries a fresh timestamp.
            req = urllib.request.Request(url, method=method, data=body.encode() if body else None, headers=self._headers(body if body is not None else f"spec:{self.id}"))
            try:
                with urllib.request.urlopen(req, timeout=60) as res:
                    return json.loads(res.read().decode() or "{}")
            except urllib.error.HTTPError as e:
                if e.code in (400, 401, 403, 404, 409, 422):
                    log("worker.call.rejected", status=e.code)
                    raise
                log("worker.call.retry", status=e.code, attempt=attempt)
            except (urllib.error.URLError, TimeoutError):
                log("worker.call.retry", attempt=attempt)
            time.sleep(2 ** attempt)
        raise RuntimeError("worker unreachable")

    # ---------- storage, through the Worker ----------

    def input_url(self, key: str) -> str:
        return self._url("/input/" + urllib.parse.quote(key, safe="/"))

    def download_input(self, key: str, dest: Path) -> Path:
        """Stream one input file to dest; a dropped connection resumes with a Range request."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        url = self.input_url(key)
        have = 0
        dest.write_bytes(b"")
        for attempt in range(5):
            headers = self._headers(self._signed_line("GET", url))
            if have:
                headers["Range"] = f"bytes={have}-"
            req = urllib.request.Request(url, method="GET", headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=120) as res, dest.open("ab" if have else "wb") as f:
                    if have and res.status != 206:
                        f.truncate(0)
                        have = 0
                    while True:
                        chunk = res.read(1024 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
                        have += len(chunk)
                log("storage.download", ok=True, bytes=have)
                return dest
            except urllib.error.HTTPError as e:
                if e.code in (400, 401, 403, 404, 409, 416, 422):
                    log("storage.download.rejected", status=e.code)
                    raise
                log("storage.download.retry", status=e.code, attempt=attempt)
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                log("storage.download.retry", attempt=attempt)
            time.sleep(2 ** attempt)
        raise RuntimeError("download failed")

    def read_input_bytes(self, key: str) -> bytes:
        tmp = WORK / "inputs" / hashlib.sha256(key.encode()).hexdigest()[:16]
        try:
            return self.download_input(key, tmp).read_bytes()
        finally:
            tmp.unlink(missing_ok=True)

    def upload_output(self, src: Path, key: str, content_type: str) -> None:
        """Write src to key in pieces through the Worker (the same protocol the browser uses)."""
        started = self._call("POST", "/output/start", json.dumps({"key": key, "contentType": content_type}))
        upload_id = started["uploadId"]
        part_size = int(started.get("partSize") or 10 * 1024 * 1024)
        parts: list[dict[str, Any]] = []
        try:
            with src.open("rb") as f:
                n = 0
                while True:
                    chunk = f.read(part_size)
                    if not chunk and n > 0:
                        break
                    n += 1
                    parts.append(self._put_part(key, upload_id, n, chunk))
                    if len(chunk) < part_size:
                        break
            self._call("POST", "/output/complete", json.dumps({"key": key, "uploadId": upload_id, "parts": parts}))
            log("storage.upload", ok=True, parts=len(parts), bytes=src.stat().st_size)
        except Exception:
            try:
                self._call("POST", "/output/abort", json.dumps({"key": key, "uploadId": upload_id}))
            except Exception:  # noqa: BLE001
                pass
            log("storage.upload", ok=False)
            raise

    def write_output_bytes(self, data: bytes, key: str, content_type: str) -> None:
        tmp = WORK / "outputs" / hashlib.sha256(key.encode()).hexdigest()[:16]
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_bytes(data)
        try:
            self.upload_output(tmp, key, content_type)
        finally:
            tmp.unlink(missing_ok=True)

    def _put_part(self, key: str, upload_id: str, n: int, chunk: bytes) -> dict[str, Any]:
        url = self._url(f"/output/parts/{n}?" + urllib.parse.urlencode({"key": key, "uploadId": upload_id}))
        for attempt in range(4):
            req = urllib.request.Request(url, method="PUT", data=chunk, headers=self._headers(self._signed_line("PUT", url), "application/octet-stream"))
            try:
                with urllib.request.urlopen(req, timeout=300) as res:
                    got = json.loads(res.read().decode() or "{}")
                    return {"partNumber": int(got["partNumber"]), "etag": str(got["etag"])}
            except urllib.error.HTTPError as e:
                if e.code in (400, 401, 403, 404, 409, 422):
                    log("storage.part.rejected", status=e.code)
                    raise
                log("storage.part.retry", status=e.code, attempt=attempt)
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                log("storage.part.retry", attempt=attempt)
            time.sleep(2 ** attempt)
        raise RuntimeError("upload failed")

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


# ---------- storage (module-level, for the jobs' existing call sites) ----------

_CURRENT: Job | None = None


def download_input(key: str, dest: Path) -> Path:
    if _CURRENT is None:
        raise RuntimeError("no job")
    return _CURRENT.download_input(key, dest)


def upload_output(src: Path, key: str, content_type: str) -> None:
    if _CURRENT is None:
        raise RuntimeError("no job")
    _CURRENT.upload_output(src, key, content_type)


def run(main) -> None:
    """Wrap a job's main(job, spec) so every failure reaches the Worker as a safe summary."""
    global _CURRENT
    job = Job.from_env()
    _CURRENT = job
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
