// Helpers for the live staging suite. Secrets come from the vault through its own Keychain
// adapter in a child process (no-prompt mode) and are held in memory only: never printed,
// never on a command line, never written to disk.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const OWNER = process.env.LIVE_OWNER_EMAIL ?? "sequoia@westpeek.ventures";
export const STAGING_DB = "sheila-creator-dashboard-db-staging";
const EVIDENCE_DIR = "docs/design/live";
const EVIDENCE_FILE = path.join(EVIDENCE_DIR, "evidence.json");

const VAULT_READ = `
import sys
from repo_operator.vault import keychain as kc
v = kc.get().get(sys.argv[1], kc.owner_account())
sys.stdout.write(v or "")
`;

const vaultCache = new Map<string, string>();
/** A vault credential by its id (e.g. `resend-app-18f24eb6`). */
export function vaultSecret(id: string): string {
  const hit = vaultCache.get(id);
  if (hit) return hit;
  const envName = `LIVE_SECRET_${id.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
  const v =
    process.env[envName] ??
    execFileSync("python3", ["-c", VAULT_READ, `repo-operator-credential-${id}`], {
      cwd: `${process.env.HOME}/repo-tools/agent`,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 20_000,
    }).trim();
  if (!v) throw new Error(`the vault has no credential ${id}`);
  vaultCache.set(id, v);
  return v;
}

export interface ResendEmail {
  id: string;
  subject: string;
  created_at: string;
  last_event: string | null;
  to: string[];
  text?: string | null;
  html?: string | null;
}

async function resend<T>(p: string): Promise<T> {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`https://api.resend.com${p}`, { headers: { Authorization: `Bearer ${vaultSecret("resend-app-18f24eb6")}` } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (!res.ok) throw new Error(`Resend answered ${res.status} for ${p.split("?")[0]}`);
    return (await res.json()) as T;
  }
  throw new Error("Resend kept answering 429");
}

/** Resend writes "2026-09-25 23:58:57.276000+00". */
export function resendTime(s: string): number {
  return Date.parse(s.replace(" ", "T").replace(/\+00$/, "Z"));
}

/** Newest email to the owner whose subject matches, sent at or after `sinceMs`; polls until found. */
export async function waitForEmail(subject: RegExp, sinceMs: number, timeoutMs = 90_000): Promise<ResendEmail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await resend<{ data: ResendEmail[] }>("/emails?limit=20");
    const hit = list.data.find((e) => subject.test(e.subject) && resendTime(e.created_at) >= sinceMs && e.to.includes(OWNER));
    if (hit) return resend<ResendEmail>(`/emails/${hit.id}`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`no email matching ${subject} since ${new Date(sinceMs).toISOString()}`);
}

/** All owner emails matching the subject since a time (for "sent exactly once" checks). */
export async function emailsSince(subject: RegExp, sinceMs: number): Promise<ResendEmail[]> {
  const list = await resend<{ data: ResendEmail[] }>("/emails?limit=50");
  return list.data.filter((e) => subject.test(e.subject) && resendTime(e.created_at) >= sinceMs);
}

/** Read-only SQL against the staging D1 (setup, evidence and cleanup checks only). */
export function d1<T = Record<string, unknown>>(sql: string): T[] {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", STAGING_DB, "--remote", "--env", "staging", "--json", "--command", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  const parsed = JSON.parse(out) as { results: T[] }[];
  return parsed[parsed.length - 1]?.results ?? [];
}

/** Poll a D1 query until `done` says yes (bounded). */
export async function waitForRow<T>(sql: string, done: (rows: T[]) => boolean, timeoutMs: number, everyMs = 15_000): Promise<T[]> {
  const deadline = Date.now() + timeoutMs;
  let rows: T[] = [];
  while (Date.now() < deadline) {
    rows = d1<T>(sql);
    if (done(rows)) return rows;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} s waiting on: ${sql.slice(0, 120)}`);
}

/** Screenshot evidence, JPEG, under 300 KB, committed under docs/design/live/. */
export async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}): Promise<string> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${name}.jpg`);
  for (const quality of [70, 50, 35]) {
    await page.screenshot({ path: file, type: "jpeg", quality, fullPage: opts.fullPage ?? false });
    if (statSync(file).size < 300_000) return file;
  }
  await page.screenshot({ path: file, type: "jpeg", quality: 35, fullPage: false });
  expect(statSync(file).size, `${file} must stay under 300 KB`).toBeLessThan(300_000);
  return file;
}

/** Merge one item's evidence into docs/design/live/evidence.json (ids, counts, run ids; never content). */
export function evidence(item: string, data: Record<string, unknown>): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const all = existsSync(EVIDENCE_FILE) ? (JSON.parse(readFileSync(EVIDENCE_FILE, "utf8")) as Record<string, Record<string, unknown>>) : {};
  all[item] = { ...(all[item] ?? {}), ...data, at: new Date().toISOString() };
  writeFileSync(EVIDENCE_FILE, `${JSON.stringify(all, null, 2)}\n`);
}

/** The newest GitHub Actions run of a job workflow started after `sinceMs`, via the gh CLI. */
export function latestRun(workflow: string, sinceMs: number): { databaseId: number; status: string; conclusion: string; createdAt: string } | null {
  const out = execFileSync("gh", ["run", "list", "--repo", "seq23/sheila-creator-dashboard", "--workflow", workflow, "--limit", "5", "--json", "databaseId,status,conclusion,createdAt"], { encoding: "utf8" });
  const runs = JSON.parse(out) as { databaseId: number; status: string; conclusion: string; createdAt: string }[];
  return runs.find((r) => Date.parse(r.createdAt) >= sinceMs - 60_000) ?? null;
}
