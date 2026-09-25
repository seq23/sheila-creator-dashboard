// Weekly brand finder + public contact finder (section 12b). OWNED BY: phase 10.
// Base stub: fills the JobHandler contract so the registry compiles; the owning phase
// replaces buildSpec/applyResult/fakeRun with the real behaviour.
import type { JobHandler } from "./registry";
import { log } from "../lib/log";

export const brandFinderJob: JobHandler = {
  async buildSpec(env, jobId, refId) {
    void env;
    return { job_id: jobId, ref_id: refId, type: "brand_finder", stub: true };
  },
  async applyResult(env, jobId, refId, result) {
    void env; void jobId; void refId; void result;
    log.info("brand_finder.apply.stub");
  },
  async onFailure(env, jobId, refId, safeError) {
    void env; void jobId; void refId;
    log.warn("brand_finder.failed", { len: safeError.length });
  },
};
