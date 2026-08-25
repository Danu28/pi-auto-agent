import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = readFileSync(resolve(root, "auto-agent.ts"), "utf8");

// The two git-safety properties the audit says to KEEP as source guards.
// Everything else that used to live here is now proven behaviorally in
// behavior.test.mjs / resume-commit.test.mjs.
test("GIT SAFETY: tracked-only staging (git add -u); never git add -A; never git init", () => {
  assert.ok(/"add",\s*"-u"/.test(src), "must stage with git add -u");
  assert.ok(!/"add",\s*"-A"/.test(src), "must NOT use git add -A");
  assert.ok(!/\["init"\]/.test(src), "must not run git init");
});
