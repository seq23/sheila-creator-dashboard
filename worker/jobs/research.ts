// Research Brief from her data + web (section 6). OWNED BY: phase 3.
// Base stub: fills the JobHandler contract so the registry compiles; the owning phase
// replaces buildSpec/applyResult/fakeRun with the real behaviour.
import type { JobHandler } from "./registry";
import { log } from "../lib/log";

export const researchJob: JobHandler = {
  async buildSpec(env, jobId, refId) {
    void env;
    return { job_id: jobId, ref_id: refId, type: "research", stub: true };
  },
  async applyResult(env, jobId, refId, result) {
    void env; void jobId; void refId; void result;
    log.info("research.apply.stub");
  },
  async onFailure(env, jobId, refId, safeError) {
    void env; void jobId; void refId;
    log.warn("research.failed", { len: safeError.length });
  },
};
