// The year of demo data (scripts/seed-year.mjs, day 358) is for the local e2e server, the unit tests
// and the screenshots, never production or staging: its CLI refuses --remote / --env, every row it
// inserts is marked (ids yr_, versions 9101+) so it can be cleared, and nothing that ships (worker/,
// app/, the deploy scripts, the job workflows) mentions it.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function walk(dir, exts) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, exts)));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

export default async function ({ root }) {
  const problems = [];
  let items = 0;
  const file = path.join(root, "scripts", "seed-year.mjs");
  const src = await readFile(file, "utf8");
  items++;
  if (!/--remote/.test(src) || !/process\.exit\(2\)/.test(src) || !/"--local"/.test(src)) problems.push("scripts/seed-year.mjs: the CLI must refuse --remote / --env and write only with --local");
  const shipped = [...(await walk(path.join(root, "worker"), [".ts"])), ...(await walk(path.join(root, "app"), [".ts", ".tsx"])), ...(await walk(path.join(root, ".github"), [".yml", ".yaml"])), path.join(root, "scripts", "deploy-production.sh"), path.join(root, "scripts", "deploy-staging.sh")];
  for (const f of shipped) {
    items++;
    const text = await readFile(f, "utf8").catch(() => "");
    if (/seed-year/.test(text)) problems.push(`${path.relative(root, f)}: mentions seed-year (demo data never ships)`);
  }
  // every row it inserts is marked, so --clear removes all of it
  const { yearSql } = await import(pathToFileURL(file).href);
  const { sql } = yearSql(new Date("2026-09-26T12:00:00Z"));
  for (const m of sql.matchAll(/INSERT INTO (\w+) \((\w+)[^)]*\) VALUES \(('?)([^,']*)/g)) {
    items++;
    const [, table, col, , value] = m;
    const ok = col === "id" ? value.startsWith("yr_") : col === "version" ? Number(value) >= 9101 && Number(value) <= 9199 : false;
    if (!ok) problems.push(`scripts/seed-year.mjs: ${table} row ${col}=${value} is not marked (ids yr_…, versions 9101-9199)`);
  }
  return { items, problems };
}
