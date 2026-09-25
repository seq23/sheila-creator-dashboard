// Extract text from brand docs, OCR scanned PDFs (section 5). OWNED BY: phase 2.
// Base stub: fills the JobHandler contract so the registry compiles; the owning phase
// replaces buildSpec/applyResult/fakeRun with the real behaviour.
import type { JobHandler } from "./registry";
import { log } from "../lib/log";

export const extractJob: JobHandler = {
  async buildSpec(env, jobId, refId) {
    void env;
    return { job_id: jobId, ref_id: refId, type: "extract", stub: true };
  },
  async applyResult(env, jobId, refId, result) {
    void env; void jobId; void refId; void result;
    log.info("extract.apply.stub");
  },
  async onFailure(env, jobId, refId, safeError) {
    void env; void jobId; void refId;
    log.warn("extract.failed", { len: safeError.length });
  },
};
