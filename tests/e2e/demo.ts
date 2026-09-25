// Demo data for the help screenshots and the deals/voice/help spec (section 12c: demo data only,
// never her real content). Seeded straight into the local D1 the e2e Worker is using, and
// removed again afterwards so the other specs see the database they expect.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";

const ROOT = process.cwd(); // playwright runs from the repo root
const SEED = path.join("tests", "e2e", "seed-demo.sql");
const DB = "sheila-creator-dashboard-db";

function d1(args: string[]) {
  execFileSync("npx", ["wrangler", "d1", "execute", DB, "--local", ...args], { cwd: ROOT, stdio: "pipe", env: { ...process.env, CI: "1" } });
}

export function seedDemo() {
  d1(["--file", SEED]);
}

/** The seed file's own clean-up block (everything before the first INSERT). */
export function clearDemo() {
  const sql = readFileSync(path.join(ROOT, SEED), "utf8");
  const clean = sql
    .slice(0, sql.indexOf("INSERT"))
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("--"))
    .join(" ");
  d1(["--command", clean]);
}

export async function setVoice(request: APIRequestContext, on: boolean) {
  const r = await request.patch("/api/settings", { data: { features: { voice: on } } });
  if (!r.ok()) throw new Error(`could not switch voice ${on ? "on" : "off"}: ${r.status()}`);
}

export const TOUR_OFF = () => {
  try {
    localStorage.setItem("ss-tour-done", "1");
  } catch {
    /* ignore */
  }
};
