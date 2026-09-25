// Every job type has a GitHub Actions workflow with `repository_dispatch: types: [<type>]`.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export default async function ({ root }) {
  const sql = await readFile(path.join(root, "migrations", "0001_init.sql"), "utf8");
  const m = sql.match(/type TEXT NOT NULL CHECK \(type IN \(([^)]+)\)\)/);
  const types = [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
  const dir = path.join(root, ".github", "workflows");
  const files = (await readdir(dir)).filter((f) => /\.ya?ml$/.test(f));
  const listened = new Set();
  for (const f of files) {
    const y = await readFile(path.join(dir, f), "utf8");
    const block = y.match(/repository_dispatch:\s*\n\s*types:\s*\[([^\]]+)\]/);
    if (block) for (const t of block[1].split(",")) listened.add(t.trim().replace(/['"]/g, ""));
  }
  const problems = types.filter((t) => !listened.has(t)).map((t) => `job type '${t}' has no workflow listening for repository_dispatch '${t}'`);
  return { items: types.length, problems };
}
