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
  d1(["--command", demoPostsSql(new Date())]);
}

/**
 * A calendar with something on it, dated from today (the SQL file cannot know "today"): one post
 * that went out (a month ago), one that failed, one waiting in Buffer and two planned. Without these the
 * Calendar guides ("A post failed", "Move or remove a post") pictured an empty week (Phase 0 live
 * review of the help-screenshots PR, 26 Sep 2026).
 */
export function demoPostsSql(now: Date): string {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const rows: [string, string, string, string, string, string | null, string | null][] = [
    // posted 35 days ago: outside the 30-day window the deals screen counts (TikTok One: "0 of 3")
    ["demo_post_1", "demo_clip_1", "tiktok", at(-35, 23), "posted", "https://www.tiktok.com/@demo/video/1", null],
    ["demo_post_2", "demo_clip_2", "instagram", at(0, 1), "failed", null, "Instagram did not accept the video. Reconnect Instagram in Buffer."],
    ["demo_post_3", "demo_clip_3", "tiktok", at(1, 23), "in_buffer", null, null],
    ["demo_post_4", "demo_clip_4", "youtube", at(2, 22), "planned", null, null],
    ["demo_post_5", "demo_clip_5", "instagram", at(3, 23), "planned", null, null],
  ];
  const q = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
  return rows
    .map(([id, clip, platform, when, status, url, error]) => `INSERT INTO posts (id, clip_id, platform, scheduled_at, status, url, error, posted_at) VALUES (${q(id)}, ${q(clip)}, ${q(platform)}, ${q(when)}, ${q(status)}, ${q(url)}, ${q(error)}, ${status === "posted" ? q(when) : "NULL"});`)
    .join(" ");
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
