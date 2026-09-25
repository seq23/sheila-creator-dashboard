#!/usr/bin/env node
// Read a staging login code without a mailbox (RUNBOOK "Staging: reading a login code without a
// mailbox"). Staging's OWNER_EMAIL is the West Peek Resend account owner's address; Resend keeps
// every sent email, so the code is read back from Resend's API instead of an inbox.
//
//   node scripts/staging-login-code.mjs            # newest login_code email on staging
//   node scripts/staging-login-code.mjs --request  # ask staging for a fresh code first
//
// Prints one JSON line: {email_id, last_event, code}. The Resend key comes from RESEND_API_KEY
// or, on the owner's Mac, from the vault (resend-app-18f24eb6) through its Keychain adapter, never echoed.
import { execFileSync } from "node:child_process";

const BASE = "https://sheila-creator-dashboard-staging.seq-taylor.workers.dev";
const OWNER = "sequoia@westpeek.ventures";
const VAULT_ITEM = "repo-operator-credential-resend-app-18f24eb6";

// Read through the vault's own Keychain adapter (no-prompt mode): a bare `security` call can raise
// a macOS permission dialog and hang an unattended agent. The value comes back on the child's
// stdout, captured here; it is never printed and never on a command line.
const VAULT_READ = `
import sys
from repo_operator.vault import keychain as kc
v = kc.get().get(sys.argv[1], kc.owner_account())
sys.stdout.write(v or "")
`;

function resendKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  const key = execFileSync("python3", ["-c", VAULT_READ, VAULT_ITEM], {
    cwd: `${process.env.HOME}/repo-tools/agent`,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 20_000,
  }).trim();
  if (!key) throw new Error("the vault has no Resend key (resend-app-18f24eb6)");
  return key;
}

function latestLoginEmailId(after) {
  const sql = `SELECT provider_id, sent_at FROM emails_sent WHERE kind = 'login_code' AND provider_id IS NOT NULL${after ? ` AND sent_at > '${after}'` : ""} ORDER BY sent_at DESC LIMIT 1`;
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "sheila-creator-dashboard-db-staging", "--remote", "--env", "staging", "--json", "--command", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(out)[0]?.results?.[0]?.provider_id ?? null;
}

const started = new Date(Date.now() - 5000).toISOString();
if (process.argv.includes("--request")) {
  const res = await fetch(`${BASE}/api/auth/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: OWNER }) });
  if (!res.ok) {
    console.log(JSON.stringify({ error: `staging /api/auth/request answered ${res.status}` }));
    process.exit(1);
  }
}
const id = latestLoginEmailId(process.argv.includes("--request") ? started : null);
if (!id) {
  console.log(JSON.stringify({ error: "no login_code email with a Resend id on staging" }));
  process.exit(1);
}
const res = await fetch(`https://api.resend.com/emails/${id}`, { headers: { Authorization: `Bearer ${resendKey()}` } });
if (!res.ok) {
  console.log(JSON.stringify({ email_id: id, error: `Resend answered ${res.status}` }));
  process.exit(1);
}
const email = await res.json();
const code = `${email.text ?? ""} ${email.html ?? ""}`.match(/login code is (\d{6})/)?.[1] ?? null;
console.log(JSON.stringify({ email_id: id, last_event: email.last_event ?? null, code }));
process.exit(code ? 0 : 1);
