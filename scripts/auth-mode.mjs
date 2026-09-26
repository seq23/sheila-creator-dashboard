#!/usr/bin/env node
// Prints the AUTH_MODE wrangler.jsonc gives a deployment: `node scripts/auth-mode.mjs production`
// or `… staging`. The deploy smokes read it so they check the mode the config actually ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseJsonc } from "./validators/envs-match.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const cfg = parseJsonc(readFileSync(path.join(root, "wrangler.jsonc"), "utf8"));
const which = process.argv[2];
const vars = which === "staging" ? cfg.env?.staging?.vars : which === "production" ? cfg.vars : null;
if (!vars) {
  process.stderr.write("usage: node scripts/auth-mode.mjs production|staging\n");
  process.exit(2);
}
// Same rule as worker/env.ts authMode(): only the exact word "open" turns the login off.
process.stdout.write(vars.AUTH_MODE === "open" ? "open" : "code");
