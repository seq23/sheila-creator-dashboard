// What a GitHub Actions job may read and write in R2, through the Worker (section 13).
// Jobs hold no storage credentials: they fetch inputs with a signed GET and write outputs with
// the signed chunked upload in routes/jobs.ts. This file is the one place that decides which
// keys a job of a given type may touch. Pure, unit-tested (tests/unit/job-storage.test.ts).
import type { JobRow } from "@shared/types";

export interface StorageScope {
  read: string[];
  write: string[];
}

/**
 * Prefixes per job type. Every job may also read and write its own scratch folder
 * `jobs/<jobId>/`. The cut job writes only into its dump's clip folder, which is exactly the
 * prefix `parseCutResult` accepts in worker/jobs/cut.ts; it reads only that dump's raw videos.
 */
export function jobStorageScope(type: JobRow["type"], jobId: string, refId: string | null): StorageScope {
  const own = `jobs/${jobId}/`;
  const scope: StorageScope = { read: [own], write: [own] };
  switch (type) {
    case "cut":
      if (refId) {
        scope.read.push(`raw/${refId}/`);
        scope.write.push(`clips/${refId}/`);
      }
      break;
    case "extract":
      scope.read.push("brain/");
      scope.write.push("brain/text/");
      break;
    case "research":
      scope.read.push("research/");
      break;
    case "voice":
      scope.read.push("voice/sample/", "voice/model/");
      scope.write.push("voice/model/");
      if (refId) {
        scope.write.push(`voice/narrations/${refId}`);
        // mix mode: its own voice over + the clip it is attached to, into its own mixed file
        scope.read.push(`voice/narrations/${refId}`, "clips/");
        scope.write.push(`voice/mixed/${refId}`);
      }
      break;
    default:
      break;
  }
  return scope;
}

/** A usable R2 key: printable, no empty or dot segments, bounded. */
export function wellFormedKey(key: string): boolean {
  if (!key || key.length > 512) return false;
  if (/[\x00-\x1f\x7f\\]/.test(key)) return false;
  return key.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

export function mayRead(scope: StorageScope, key: string): boolean {
  return wellFormedKey(key) && scope.read.some((p) => key.startsWith(p));
}

export function mayWrite(scope: StorageScope, key: string): boolean {
  return wellFormedKey(key) && scope.write.some((p) => key.startsWith(p));
}

/** The string a job signs for a request without a JSON body: the method and the exact path + query. */
export function signedRequestLine(method: string, pathAndQuery: string): string {
  return method.toUpperCase() === "GET" ? pathAndQuery : `${method.toUpperCase()} ${pathAndQuery}`;
}

/** Content-Range for a ranged R2 read. */
export function contentRange(range: R2Range | undefined, size: number): string | null {
  if (!range) return null;
  let start: number;
  let end: number;
  if ("suffix" in range && range.suffix !== undefined) {
    start = Math.max(0, size - range.suffix);
    end = size - 1;
  } else {
    const r = range as { offset?: number; length?: number };
    start = r.offset ?? 0;
    end = r.length !== undefined ? Math.min(size - 1, start + r.length - 1) : size - 1;
  }
  return `bytes ${start}-${end}/${size}`;
}
