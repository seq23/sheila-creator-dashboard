// Chatterbox narration (section 12). OWNED BY: phase 11.
// Base stub: fills the JobHandler contract so the registry compiles; the owning phase
// replaces buildSpec/applyResult/fakeRun with the real behaviour.
import type { JobHandler } from "./registry";
import { log } from "../lib/log";

export const voiceJob: JobHandler = {
  async buildSpec(env, jobId, refId) {
    void env;
    return { job_id: jobId, ref_id: refId, type: "voice", stub: true };
  },
  async applyResult(env, jobId, refId, result) {
    void env; void jobId; void refId; void result;
    log.info("voice.apply.stub");
  },
  async onFailure(env, jobId, refId, safeError) {
    void env; void jobId; void refId;
    log.warn("voice.failed", { len: safeError.length });
  },
};
