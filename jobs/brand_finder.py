"""Weekly brand finder + public contact finder (section 12b). OWNED BY: phase 10.

Base stub: proves the signed spec → work → callback loop end to end. The owning phase
replaces main() with the real behaviour and keeps the contract.
"""
from __future__ import annotations

from typing import Any

from common import Job, log, run


def main(job: Job, spec: dict[str, Any]) -> dict[str, Any]:
    log("brand_finder.spec", stub=bool(spec.get("stub")))
    job.progress("starting", 0, 1)
    return {"stub": True}


if __name__ == "__main__":
    run(main)
