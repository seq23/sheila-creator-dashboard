// Cut a dump into clips (section 8). OWNED BY: phase 4 (Editing engine).
// Base stub: fills the JobHandler contract so the registry compiles; the owning phase
// replaces buildSpec/applyResult/fakeRun with the real behaviour.
import type { JobHandler } from "./registry";
import { log } from "../lib/log";

export const cutJob: JobHandler = {
  async buildSpec(env, jobId, refId) {
    void env;
    return { job_id: jobId, ref_id: refId, type: "cut", stub: true };
  },
  async applyResult(env, jobId, refId, result) {
    void env; void jobId; void refId; void result;
    log.info("cut.apply.stub");
  },
  async onFailure(env, jobId, refId, safeError) {
    void env; void jobId; void refId;
    log.warn("cut.failed", { len: safeError.length });
  },
};
