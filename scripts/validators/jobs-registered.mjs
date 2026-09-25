// Every job type the schema allows has a handler in worker/jobs/registry.ts.
import { readFile } from "node:fs/promises";
import path from "node:path";

export default async function ({ root }) {
  const sql = await readFile(path.join(root, "migrations", "0001_init.sql"), "utf8");
  const m = sql.match(/type TEXT NOT NULL CHECK \(type IN \(([^)]+)\)\)/);
  if (!m) throw new Error("jobs.type CHECK not found in 0001_init.sql");
  const types = [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
  const registry = await readFile(path.join(root, "worker", "jobs", "registry.ts"), "utf8");
  const problems = [];
  for (const t of types) {
    if (!new RegExp(`^\\s*${t}:\\s*\\w+,?$`, "m").test(registry)) problems.push(`job type '${t}' has no handler in registry.ts`);
  }
  return { items: types.length, problems };
}
