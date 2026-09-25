// Staging must be production's twin. Parses wrangler.jsonc and fails if env.staging differs from
// the top-level (production) config in anything except:
//   * name,
//   * D1 database_name / database_id and R2 bucket_name,
//   * the vars OWNER_EMAIL, PUBLIC_BASE_URL, ENV_NAME, FAKE_SERVICES.
// Wrangler does not inherit vars / d1_databases / r2_buckets into an env, so staging must
// restate them; a var or binding production has and staging lacks is a difference too.
// Then every job workflow that runs against a deployed Worker must map the dispatch payload's
// `env` to the right shared secret and bucket, with bucket names equal to wrangler.jsonc's.
// Items: the compared config keys + vars + bindings, plus every job workflow checked.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/** Strip // and /* *\/ comments and trailing commas, respecting strings ("/api/*" is a string). */
export function parseJsonc(src) {
  let out = "";
  let i = 0;
  let inStr = false;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      out += ch;
      if (ch === "\\") {
        out += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') inStr = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i + 2);
      if (i < 0) throw new Error("unterminated block comment");
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const ALLOWED_VAR_DIFFS = new Set(["OWNER_EMAIL", "PUBLIC_BASE_URL", "ENV_NAME", "FAKE_SERVICES"]);
// Keys wrangler never inherits into an env: staging must restate each one.
const NON_INHERITED = ["vars", "d1_databases", "r2_buckets"];
// Keys that differ by design, compared field by field below.
const SPECIAL = new Set(["name", "vars", "d1_databases", "r2_buckets", "env"]);
// Deployment-level keys that stay top-level only (one account, one entry point).
const TOP_ONLY = new Set(["$schema", "main", "compatibility_date", "compatibility_flags", "account_id", "workers_dev", "observability"]);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function compareEnvs(cfg) {
  const problems = [];
  let items = 0;
  const prod = cfg;
  const stg = cfg.env?.staging;
  if (!stg) return { items: 0, problems: ["wrangler.jsonc has no env.staging"] };

  if (!stg.name || stg.name === prod.name) problems.push("env.staging.name must be its own Worker name");
  items++;
  if (prod.vars?.ENV_NAME !== "production") problems.push(`top-level vars.ENV_NAME must be "production" (is ${JSON.stringify(prod.vars?.ENV_NAME)})`);
  if (stg.vars?.ENV_NAME !== "staging") problems.push(`env.staging vars.ENV_NAME must be "staging" (is ${JSON.stringify(stg.vars?.ENV_NAME)})`);
  if (stg.vars?.FAKE_SERVICES !== "0") problems.push("env.staging must be fully real: vars.FAKE_SERVICES \"0\"");
  items += 3;

  for (const k of NON_INHERITED) if (prod[k] !== undefined && stg[k] === undefined) problems.push(`env.staging must restate "${k}" (wrangler does not inherit it)`);

  // Every other top-level key: staging either inherits it (absent) or restates it identically.
  for (const k of Object.keys(prod)) {
    if (SPECIAL.has(k)) continue;
    items++;
    if (TOP_ONLY.has(k)) {
      if (k in stg && !same(stg[k], prod[k])) problems.push(`env.staging.${k} differs from production`);
      continue;
    }
    if (!(k in stg)) problems.push(`env.staging must restate "${k}" explicitly so the twin is visible`);
    else if (!same(stg[k], prod[k])) problems.push(`env.staging.${k} differs from production`);
  }
  for (const k of Object.keys(stg)) if (!(k in prod) && !SPECIAL.has(k)) problems.push(`env.staging has "${k}" that production lacks`);

  // vars: same key set, same values except the allowed four.
  const pv = prod.vars ?? {};
  const sv = stg.vars ?? {};
  for (const k of new Set([...Object.keys(pv), ...Object.keys(sv)])) {
    items++;
    if (!(k in pv)) problems.push(`env.staging var ${k} is not in production`);
    else if (!(k in sv)) problems.push(`env.staging is missing var ${k}`);
    else if (!ALLOWED_VAR_DIFFS.has(k) && pv[k] !== sv[k]) problems.push(`env.staging var ${k} differs from production`);
  }

  // bindings: same bindings and shape; only the ids / names may differ, and they MUST differ.
  const bind = (key, idFields) => {
    const p = prod[key] ?? [];
    const s = stg[key] ?? [];
    if (p.length !== s.length) problems.push(`env.staging ${key} has ${s.length} bindings, production has ${p.length}`);
    for (const pb of p) {
      items++;
      const sb = s.find((x) => x.binding === pb.binding);
      if (!sb) {
        problems.push(`env.staging ${key} lacks binding ${pb.binding}`);
        continue;
      }
      const strip = (o) => Object.fromEntries(Object.entries(o).filter(([f]) => !idFields.includes(f)));
      if (!same(strip(pb), strip(sb))) problems.push(`env.staging ${key} ${pb.binding} differs from production beyond its id/name`);
      for (const f of idFields) if (pb[f] !== undefined && pb[f] === sb[f]) problems.push(`env.staging ${key} ${pb.binding}.${f} is production's: staging would write to Sheila's data`);
    }
  };
  bind("d1_databases", ["database_name", "database_id"]);
  bind("r2_buckets", ["bucket_name"]);
  return { items, problems };
}

export function checkWorkflow(name, yml, buckets) {
  const problems = [];
  if (!/repository_dispatch:/.test(yml)) return { skip: true, problems };
  // help_screenshots runs the app inside the runner (local wrangler dev + a CI-only secret);
  // it never calls a deployed Worker, so it has no deployment to pick.
  if (!/secrets\.JOB_SHARED_SECRET\b/.test(yml)) return { skip: true, problems };
  const secret = yml.match(/JOB_SHARED_SECRET:\s*(.+)/)?.[1] ?? "";
  if (!secret.includes("client_payload.env == 'staging'") || !secret.includes("secrets.JOB_SHARED_SECRET_STAGING") || !secret.includes("secrets.JOB_SHARED_SECRET }}"))
    problems.push(`${name}: JOB_SHARED_SECRET must pick secrets.JOB_SHARED_SECRET_STAGING when client_payload.env is 'staging'`);
  if (!/JOB_ENV:\s*\$\{\{\s*github\.event\.client_payload\.env == 'staging'/.test(yml)) problems.push(`${name}: JOB_ENV must come from client_payload.env`);
  if (!/WORKER_URL:\s*\$\{\{\s*github\.event\.client_payload\.worker_url\s*\}\}/.test(yml)) problems.push(`${name}: WORKER_URL must be the payload's worker_url (the deployment that started it)`);
  const bucket = yml.match(/R2_BUCKET:\s*(.+)/)?.[1];
  if (bucket !== undefined) {
    const want = `\${{ github.event.client_payload.env == 'staging' && '${buckets.staging}' || '${buckets.production}' }}`;
    if (bucket.trim() !== want) problems.push(`${name}: R2_BUCKET must be ${want}`);
  }
  return { skip: false, problems };
}

export default async function ({ root }) {
  const cfg = parseJsonc(await readFile(path.join(root, "wrangler.jsonc"), "utf8"));
  const { items: cfgItems, problems } = compareEnvs(cfg);
  let items = cfgItems;
  const buckets = { production: cfg.r2_buckets?.[0]?.bucket_name, staging: cfg.env?.staging?.r2_buckets?.[0]?.bucket_name };
  const dir = path.join(root, ".github", "workflows");
  const files = (await readdir(dir)).filter((f) => /^job-.*\.ya?ml$/.test(f)).sort();
  let workflows = 0;
  for (const f of files) {
    const r = checkWorkflow(f, await readFile(path.join(dir, f), "utf8"), buckets);
    if (r.skip) continue;
    workflows++;
    items++;
    problems.push(...r.problems);
  }
  if (workflows === 0) problems.push("no job workflow was checked (Rule 0)");
  return { items, problems };
}
