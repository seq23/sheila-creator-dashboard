// The year of demo data (scripts/seed-year.mjs, day 358) is for the local e2e server, the unit tests,
// the screenshots and the PUBLIC SAMPLE, never production: its CLI refuses --remote / --env outright,
// `--remote-sample` may only target wrangler.jsonc env.staging when that IS the sample (Worker
// `samplestudio`, a `-staging` D1 and R2, FAKE_SERVICES "1"; proven here by pointing a scratch copy of
// the config at production and watching it refuse), the sample reset drops every connection, light
// and session (a real key never survives into the demo), every row it inserts is marked (ids yr_,
// versions 9101+) so it can be cleared, and nothing that ships (worker/, app/, the deploy scripts,
// the job workflows) mentions it or the media builder.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseJsonc } from "./envs-match.mjs";

async function walk(dir, exts) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, exts)));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const refuses = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

export default async function ({ root }) {
  const problems = [];
  let items = 0;
  const file = path.join(root, "scripts", "seed-year.mjs");
  const src = await readFile(file, "utf8");
  items++;
  if (!/--remote/.test(src) || !/process\.exit\(2\)/.test(src) || !/"--local"/.test(src)) problems.push("scripts/seed-year.mjs: the CLI must refuse --remote / --env and write only with --local");
  if (!/remoteSampleTarget\(/.test(src) || !/--remote-sample/.test(src)) problems.push("scripts/seed-year.mjs: --remote-sample must resolve its target through remoteSampleTarget()");
  const shipped = [...(await walk(path.join(root, "worker"), [".ts"])), ...(await walk(path.join(root, "app"), [".ts", ".tsx"])), ...(await walk(path.join(root, ".github"), [".yml", ".yaml"])), path.join(root, "scripts", "deploy-production.sh"), path.join(root, "scripts", "deploy-staging.sh")];
  for (const f of shipped) {
    items++;
    const text = await readFile(f, "utf8").catch(() => "");
    if (/seed-year|sample-media/.test(text)) problems.push(`${path.relative(root, f)}: mentions seed-year / sample-media (demo data never ships)`);
  }
  // every row it inserts is marked, so --clear removes all of it
  const { yearSql, remoteSampleTarget, sampleResetSql, SAMPLE_WORKER } = await import(pathToFileURL(file).href);
  const { sql } = yearSql(new Date("2026-09-26T12:00:00Z"));
  for (const m of sql.matchAll(/INSERT INTO (\w+) \((\w+)[^)]*\) VALUES \(('?)([^,']*)/g)) {
    items++;
    const [, table, col, , value] = m;
    const ok = col === "id" ? value.startsWith("yr_") : col === "version" ? Number(value) >= 9101 && Number(value) <= 9199 : false;
    if (!ok) problems.push(`scripts/seed-year.mjs: ${table} row ${col}=${value} is not marked (ids yr_…, versions 9101-9199)`);
  }

  // --remote-sample: exactly one allowed target, and production is refused (the negative proof).
  const cfg = parseJsonc(await readFile(path.join(root, "wrangler.jsonc"), "utf8"));
  items++;
  if (SAMPLE_WORKER !== "samplestudio") problems.push(`scripts/seed-year.mjs: SAMPLE_WORKER must be "samplestudio" (is ${JSON.stringify(SAMPLE_WORKER)})`);
  let target = null;
  try {
    target = remoteSampleTarget(cfg);
  } catch (e) {
    problems.push(`scripts/seed-year.mjs: remoteSampleTarget refuses the committed env.staging: ${e.message}`);
  }
  if (target) {
    if (target.name !== "samplestudio" || target.name !== cfg.env.staging.name) problems.push("remoteSampleTarget must resolve env.staging.name = samplestudio");
    if (!target.db.endsWith("-staging") || target.db === cfg.d1_databases[0].database_name) problems.push("remoteSampleTarget must resolve a -staging D1 that is not production's");
    if (!target.bucket?.endsWith("-staging") || target.bucket === cfg.r2_buckets[0].bucket_name) problems.push("remoteSampleTarget must resolve a -staging R2 bucket that is not production's");
    if (!target.wranglerArgs.includes("--env") || !target.wranglerArgs.includes("staging")) problems.push("remoteSampleTarget must apply with --env staging");
  }
  const scratch = () => JSON.parse(JSON.stringify(cfg));
  const asProduction = scratch();
  asProduction.env.staging = { ...asProduction.env.staging, name: cfg.name, d1_databases: cfg.d1_databases, r2_buckets: cfg.r2_buckets };
  const prodDb = scratch();
  prodDb.env.staging.d1_databases = cfg.d1_databases;
  const prodBucket = scratch();
  prodBucket.env.staging.r2_buckets = cfg.r2_buckets;
  const realServices = scratch();
  realServices.env.staging.vars.FAKE_SERVICES = "0";
  const otherWorker = scratch();
  otherWorker.env.staging.name = "sheila-creator-dashboard-staging";
  const noStaging = scratch();
  delete noStaging.env;
  for (const [what, c] of [["env.staging pointed at production", asProduction], ["production's D1 under env.staging", prodDb], ["production's R2 under env.staging", prodBucket], ["a sample on real services", realServices], ["another Worker name", otherWorker], ["no env.staging at all", noStaging]]) {
    items++;
    if (!refuses(() => remoteSampleTarget(c))) problems.push(`scripts/seed-year.mjs: remoteSampleTarget accepted ${what}; it must refuse`);
  }

  // The sample reset: no connection, light or session survives into the public demo.
  const reset = sampleResetSql();
  for (const table of ["connections", "health", "sessions", "login_codes", "posts", "clips", "deals"]) {
    items++;
    if (!new RegExp(`DELETE FROM ${table};`).test(reset)) problems.push(`scripts/seed-year.mjs: sampleResetSql must DELETE FROM ${table} (the sample holds demo data only)`);
  }
  const sample = yearSql(new Date("2026-09-26T12:00:00Z"), { sample: true });
  items++;
  if (!sample.sql.startsWith(reset)) problems.push("scripts/seed-year.mjs: the sample SQL must begin with the sample reset");
  if (sample.media.length < 500) problems.push(`scripts/seed-year.mjs: the sample lists ${sample.media.length} media keys; the screens need the clips, covers, thumbnails, narrations and mixes (500+)`);
  const prefixes = /^(clips|full|narrations|music|docs|voice|kit\/photo)\//;
  for (const m of sample.media) if (!prefixes.test(m.key)) problems.push(`scripts/seed-year.mjs: sample media key ${m.key} is outside the app's own folders`);
  return { items, problems };
}
